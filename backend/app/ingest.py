"""Ingestion pipeline: load -> chunk -> embed -> store (CoALA: learning action)."""

from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import settings
from .vectorstore import get_vector_store

SUPPORTED = {".pdf", ".txt", ".md"}


def _load(path: str, filename: str) -> list[Document]:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        docs = PyPDFLoader(path).load()
    elif ext in {".txt", ".md"}:
        docs = TextLoader(path, encoding="utf-8").load()
    else:
        raise ValueError(f"Unsupported file type '{ext}'. Use .pdf, .txt or .md.")
    for d in docs:
        # PyPDFLoader pages are 0-based; show 1-based pages to people.
        page = d.metadata.get("page")
        d.metadata = {
            "source": filename,
            "page": page + 1 if isinstance(page, int) else None,
        }
    return docs


def _split(docs: list[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap
    )
    return splitter.split_documents(docs)


def ingest_file(path: str, filename: str) -> int:
    """Index one file into the vector store. Returns the number of chunks."""
    chunks = [c for c in _split(_load(path, filename)) if c.page_content.strip()]
    if chunks:
        # Embedding happens inside add_documents (OpenAI embeddings API).
        get_vector_store().add_documents(chunks)
    return len(chunks)
