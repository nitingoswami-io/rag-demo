"""FastAPI entry point: knowledge bases, chat, read-only database view, optional uploads."""

import logging
import os
import tempfile
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import openai
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import access, samples
from .config import settings
from .ingest import SUPPORTED, ingest_file
from .rag import answer
from .vectorstore import UPLOADS_PACK, delete_source, pack_documents, pack_rows

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    samples.seed()
    if access.gate_active() and not settings.resend_api_key:
        log.warning("DEMO_ACCESS_SECRET is set but RESEND_API_KEY is not: access links go to this log only.")
    yield


app = FastAPI(title="RAG Demo API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-Demo-Pass"],
)


class ApiError(Exception):
    """An error the frontend can act on: `code` is part of the contract in docs/DEMO_ACCESS.md."""

    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


@app.exception_handler(ApiError)
def _api_error(_: Request, e: ApiError):
    return JSONResponse({"detail": e.message, "code": e.code}, status_code=e.status)


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
        raise ApiError(429, "rate_limited", f"Too many requests. Limit is {per_minute} per minute.")
    if bucket == "chat" and not _take(("chat", "*all*"), settings.global_chat_per_minute):
        raise ApiError(429, "rate_limited", "The demo is busy right now. Please try again in a minute.")


def _require_pass(request: Request) -> None:
    """When the gate is on, /chat needs a valid pass in X-Demo-Pass (docs/DEMO_ACCESS.md)."""
    if not access.gate_active():
        return
    email = access.verify_pass(request.headers.get("x-demo-pass"))
    if email is None:
        raise ApiError(401, "access_required", "The live demo needs an access link. Request one with your email.")
    if not access.allow_chat(email):
        raise ApiError(
            429,
            "rate_limited",
            f"You've asked {settings.pass_chats_per_day} questions today, the daily limit for the live demo. "
            "Come back tomorrow, or run it yourself with your own key.",
        )


def _provider_unavailable(e: Exception) -> bool:
    """Out of credit, or a dead key: no visitor can fix it, so it becomes demo_unavailable."""
    if isinstance(e, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return True
    return isinstance(e, openai.RateLimitError) and (
        getattr(e, "code", None) == "insufficient_quota" or "insufficient_quota" in str(e)
    )


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


class AccessRequest(BaseModel):
    email: str = Field(max_length=254)
    reason: Literal["access_required", "demo_unavailable"] = "access_required"
    website: str = Field(default="", max_length=200)  # honeypot


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
        "access_required": access.gate_active(),
        "pass_days": settings.demo_pass_days,
    }


@app.post("/access/request", status_code=202)
def request_access(req: AccessRequest, request: Request):
    """Email an access link. Always 202 for a valid address, so it reveals nothing."""
    if not access.gate_active():
        raise ApiError(409, "access_open", "This demo has no access gate; it is already open.")
    if req.website:
        return {"ok": True}
    try:
        access.request_access(req.email, req.reason, _client_ip(request))
    except ValueError as e:
        raise ApiError(400, "invalid_email", str(e)) from e
    except Exception as e:
        raise ApiError(502, "email_failed", "Could not send the email right now. Try again in a minute.") from e
    return {"ok": True}


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
    _require_pass(request)
    _rate_limit(request, "chat", settings.chat_per_minute)
    try:
        return answer(req.message, [m.model_dump() for m in req.history], req.pack)
    except Exception as e:
        if _provider_unavailable(e):
            access.alert_unavailable(e)
            raise ApiError(
                503, "demo_unavailable", "The live demo is out of API credit right now. Request an access link."
            ) from e
        if isinstance(e, openai.RateLimitError):
            raise ApiError(429, "rate_limited", "The demo is busy right now. Please try again in a minute.") from e
        log.exception("Chat failed")
        raise HTTPException(500, "Chat failed. Please try again.") from e
