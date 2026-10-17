"""Query pipeline: retrieve -> build prompt (working memory) -> generate."""

from functools import lru_cache

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from .config import settings
from .vectorstore import get_vector_store

SYSTEM = """You are a helpful assistant for a document Q&A demo.
Answer the question using ONLY the context below.
If the answer is not in the context, reply exactly:
"I don't know based on the uploaded documents."
Cite sources inline as [filename p.N] (omit p.N when there is no page).

Context:
{context}"""

PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM),
        MessagesPlaceholder("history"),
        ("human", "{question}"),
    ]
)


@lru_cache
def _llm() -> ChatOpenAI:
    return ChatOpenAI(model=settings.chat_model, temperature=0)


def _format_context(docs: list[Document]) -> str:
    if not docs:
        return "(no documents have been uploaded yet)"
    parts = []
    for d in docs:
        page = d.metadata.get("page")
        label = f"{d.metadata.get('source')}" + (f" p.{page}" if page else "")
        parts.append(f"[{label}]\n{d.page_content}")
    return "\n\n---\n\n".join(parts)


def answer(question: str, history: list[dict]) -> dict:
    # 1. Retrieval action: semantic memory -> top-k chunks.
    docs = get_vector_store().similarity_search(question, k=settings.top_k)

    # 2. Working memory: rules + retrieved context + recent turns + question.
    recent = history[-settings.history_turns :]
    messages = PROMPT.invoke(
        {
            "context": _format_context(docs),
            "history": [
                ("human" if m["role"] == "user" else "ai", m["content"]) for m in recent
            ],
            "question": question,
        }
    )

    # 3. Reasoning action: the LLM writes a grounded answer.
    reply = _llm().invoke(messages)

    return {
        "answer": reply.content,
        "sources": [
            {
                "source": d.metadata.get("source"),
                "page": d.metadata.get("page"),
                "snippet": d.page_content[:300],
            }
            for d in docs
        ],
    }
