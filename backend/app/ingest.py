"""Ingestion pipeline: load -> chunk -> embed -> store (CoALA: learning action)."""

import hashlib
import uuid
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import settings
from .vectorstore import delete_stale, get_vector_store, stored_versions

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


def _file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


def ingest_file(path: str, filename: str, pack: str) -> tuple[int, str]:
    """Index one file into a pack, de-duplicated by filename + content hash.

    Returns (chunk_count, status) where status is:
      "unchanged" - same file already indexed in this pack; nothing embedded
      "updated"   - same filename, new content (or new pack); old chunks replaced
      "added"     - new filename
    """
    file_hash = _file_hash(path)
    existing = stored_versions(filename)
    if existing == {(file_hash, pack)}:
        return 0, "unchanged"

    chunks = [c for c in _split(_load(path, filename)) if c.page_content.strip()]
    for i, c in enumerate(chunks):
        c.metadata.update(file_hash=file_hash, pack=pack, chunk=i + 1)

    if chunks:
        # Stable ids make a retried upload overwrite rows instead of duplicating them.
        ids = [str(uuid.uuid5(uuid.NAMESPACE_URL, f"{filename}:{file_hash}:{i}"))
               for i in range(len(chunks))]
        # Embedding happens inside add_documents (OpenAI embeddings API).
        get_vector_store().add_documents(chunks, ids=ids)

    # Remove the old version only after the new one is stored.
    if existing:
        delete_stale(filename, keep_hash=file_hash)
    return len(chunks), "updated" if existing else "added"
