"""FastAPI entry point: upload, documents, chat."""

import os
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .ingest import SUPPORTED, ingest_file
from .rag import answer
from .vectorstore import list_sources

app = FastAPI(title="RAG Demo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[Message] = []


class Source(BaseModel):
    source: str | None
    page: int | None
    snippet: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]


class UploadResult(BaseModel):
    filename: str
    chunks: int
    status: Literal["added", "updated", "unchanged"]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload", response_model=list[UploadResult])
def upload(files: list[UploadFile] = File(...)):
    for f in files:
        if Path(f.filename or "").suffix.lower() not in SUPPORTED:
            raise HTTPException(400, f"{f.filename}: only .pdf, .txt and .md are supported.")

    results = []
    for f in files:
        suffix = Path(f.filename).suffix.lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(f.file.read())
            tmp_path = tmp.name
        try:
            chunks, status = ingest_file(tmp_path, f.filename)
        except Exception as e:
            raise HTTPException(500, f"Failed to index {f.filename}: {e}") from e
        finally:
            os.unlink(tmp_path)
        results.append(UploadResult(filename=f.filename, chunks=chunks, status=status))
    return results


@app.get("/documents", response_model=list[str])
def documents():
    try:
        return list_sources()
    except Exception as e:
        raise HTTPException(500, f"Could not read documents: {e}") from e


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(400, "Message is empty.")
    try:
        return answer(req.message, [m.model_dump() for m in req.history])
    except Exception as e:
        raise HTTPException(500, f"Chat failed: {e}") from e
