"""Query pipeline: retrieve -> build prompt (working memory) -> generate."""

import time
from functools import lru_cache

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from .config import settings
from .vectorstore import count_chunks, get_vector_store

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


def answer(question: str, history: list[dict], pack: str) -> dict:
    t0 = time.perf_counter()

    # 1. Retrieval action: semantic memory -> top-k chunks, limited to one knowledge base.
    hits = get_vector_store().similarity_search_with_score(
        question, k=settings.top_k, filter={"pack": {"$eq": pack}}
    )
    docs = [d for d, _ in hits]
    t1 = time.perf_counter()

    # 2. Working memory: rules + retrieved context + recent turns + question.
    recent = history[-settings.history_turns :]
    context = _format_context(docs)
    messages = PROMPT.invoke(
        {
            "context": context,
            "history": [
                ("human" if m["role"] == "user" else "ai", m["content"]) for m in recent
            ],
            "question": question,
        }
    )

    # 3. Reasoning action: the LLM writes a grounded answer.
    reply = _llm().invoke(messages)
    t2 = time.perf_counter()
    usage = reply.usage_metadata or {}

    return {
        "answer": reply.content,
        "sources": [
            {
                "rank": i + 1,
                "id": d.id,
                "source": d.metadata.get("source"),
                "page": d.metadata.get("page"),
                "chunk": d.metadata.get("chunk"),
                "pack": d.metadata.get("pack"),
                # PGVector returns cosine distance; 1 - distance is cosine similarity.
                "score": round(1 - distance, 4),
                "chars": len(d.page_content),
                "snippet": d.page_content[:400],
            }
            for i, (d, distance) in enumerate(hits)
        ],
        "stats": {
            "retrieve_ms": round((t1 - t0) * 1000),
            "generate_ms": round((t2 - t1) * 1000),
            "total_ms": round((t2 - t0) * 1000),
            "chunks_searched": count_chunks(pack),
            "context_chars": len(context),
            "history_turns": len(recent),
            "prompt_tokens": usage.get("input_tokens"),
            "completion_tokens": usage.get("output_tokens"),
            "model": settings.chat_model,
        },
    }
