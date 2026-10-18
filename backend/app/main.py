"""FastAPI entry point: knowledge bases, chat, read-only database view, optional uploads."""

import logging
import os
import tempfile
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import samples
from .config import settings
from .ingest import SUPPORTED, ingest_file
from .rag import answer
from .vectorstore import UPLOADS_PACK, delete_source, pack_documents, pack_rows

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    samples.seed()
    yield


app = FastAPI(title="RAG Demo API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


# --- Simple in-memory rate limit per client IP (enough for a single-process demo) ---
_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    if settings.trust_proxy:
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
    return request.client.host if request.client else "?"


def _take(key: tuple[str, str], per_minute: int) -> bool:
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= per_minute:
        return False
    q.append(now)
    return True


def _rate_limit(request: Request, bucket: str, per_minute: int) -> None:
    if not _take((bucket, _client_ip(request)), per_minute):
        raise HTTPException(429, f"Too many requests. Limit is {per_minute} per minute.")
    if bucket == "chat" and not _take(("chat", "*all*"), settings.global_chat_per_minute):
        raise HTTPException(429, "The demo is busy right now. Please try again in a minute.")


def _require_uploads() -> None:
    if not settings.allow_uploads:
        raise HTTPException(403, "Uploads are disabled in this demo. Pick a sample knowledge base.")


def _check_pack(pack: str) -> None:
    if pack not in samples.pack_ids():
        raise HTTPException(404, f"Unknown knowledge base '{pack}'.")


# --- Models ---
class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(max_length=1000)
    history: list[Message] = Field(default=[], max_length=20)
    pack: str


class Source(BaseModel):
    rank: int
    id: str | None
    source: str | None
    page: int | None
    chunk: int | None
    pack: str | None
    score: float
    chars: int
    snippet: str


class Stats(BaseModel):
    retrieve_ms: int
    generate_ms: int
    total_ms: int
    chunks_searched: int
    context_chars: int
    history_turns: int
    prompt_tokens: int | None
    completion_tokens: int | None
    model: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]
    stats: Stats


class UploadResult(BaseModel):
    filename: str
    chunks: int
    status: Literal["added", "updated", "unchanged"]


class DeleteResult(BaseModel):
    filename: str
    chunks_deleted: int


# --- Routes ---
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/config")
def config():
    return {
        "allow_uploads": settings.allow_uploads,
        "max_upload_mb": settings.max_upload_mb,
        "chat_model": settings.chat_model,
        "embedding_model": settings.embedding_model,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "top_k": settings.top_k,
    }


@app.get("/packs")
def list_packs():
    try:
        out = [{**p, "readonly": True, "documents": pack_documents(p["id"])} for p in samples.packs()]
        if settings.allow_uploads:
            out.append(
                {
                    "id": UPLOADS_PACK,
                    "title": "Your documents",
                    "audience": "You (local mode)",
                    "problem": "Your own files, indexed on this machine.",
                    "value": "Try RAG on your own PDFs, text and Markdown files.",
                    "files": [],
                    "questions": [],
                    "readonly": False,
                    "documents": pack_documents(UPLOADS_PACK),
                }
            )
        return out
    except Exception as e:
        raise HTTPException(500, f"Could not read knowledge bases: {e}") from e


@app.get("/packs/{pack}/rows")
def rows(pack: str):
    _check_pack(pack)
    try:
        return {"limit": settings.db_view_limit, "rows": pack_rows(pack, settings.db_view_limit)}
    except Exception as e:
        raise HTTPException(500, f"Could not read rows: {e}") from e


@app.post("/upload", response_model=list[UploadResult])
def upload(request: Request, files: list[UploadFile] = File(...)):
    _require_uploads()
    _rate_limit(request, "upload", settings.upload_per_minute)
    if len(files) > settings.max_files_per_upload:
        raise HTTPException(400, f"Upload at most {settings.max_files_per_upload} files at a time.")
    for f in files:
        name = f.filename or ""
        if Path(name).suffix.lower() not in SUPPORTED:
            raise HTTPException(400, f"{name}: only .pdf, .txt and .md are supported.")
        if name in samples.sample_filenames():
            raise HTTPException(409, f"{name} is a sample document name. Rename the file and retry.")
        if (f.size or 0) > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, f"{name} is larger than {settings.max_upload_mb} MB.")

    results = []
    for f in files:
        suffix = Path(f.filename).suffix.lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(f.file.read())
            tmp_path = tmp.name
        try:
            chunks, status = ingest_file(tmp_path, f.filename, UPLOADS_PACK)
        except Exception as e:
            raise HTTPException(500, f"Failed to index {f.filename}: {e}") from e
        finally:
            os.unlink(tmp_path)
        results.append(UploadResult(filename=f.filename, chunks=chunks, status=status))
    return results


@app.delete("/documents/{filename}", response_model=DeleteResult)
def delete_document(filename: str):
    _require_uploads()
    if filename in samples.sample_filenames():
        raise HTTPException(403, "Sample documents are read-only.")
    try:
        deleted = delete_source(filename)
    except Exception as e:
        raise HTTPException(500, f"Could not delete {filename}: {e}") from e
    if deleted == 0:
        raise HTTPException(404, f"{filename} is not indexed.")
    return DeleteResult(filename=filename, chunks_deleted=deleted)


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, request: Request):
    if not req.message.strip():
        raise HTTPException(400, "Message is empty.")
    _check_pack(req.pack)
    _rate_limit(request, "chat", settings.chat_per_minute)
    try:
        return answer(req.message, [m.model_dump() for m in req.history], req.pack)
    except Exception as e:
        raise HTTPException(500, f"Chat failed: {e}") from e
