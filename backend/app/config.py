"""App settings, loaded from backend/.env."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _flag(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql+psycopg://rag:rag@localhost:5432/rag")
    # Hosted Postgres (Supabase, Railway, Neon) hands out postgres:// or postgresql:// URLs;
    # SQLAlchemy needs the psycopg 3 driver named explicitly.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def _list(name: str, default: str) -> tuple[str, ...]:
    return tuple(x.strip().rstrip("/") for x in os.getenv(name, default).split(",") if x.strip())


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    database_url: str = _database_url()
    chat_model: str = os.getenv("CHAT_MODEL", "gpt-4o-mini")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    collection: str = "docs"
    chunk_size: int = 1000
    chunk_overlap: int = 150
    top_k: int = 4
    history_turns: int = 6

    # Demo safety. Uploads are off by default: visitors can only query the sample packs.
    # Set ALLOW_UPLOADS=true for local use (all uploads share one "uploads" knowledge base).
    allow_uploads: bool = _flag("ALLOW_UPLOADS")
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "5"))
    max_files_per_upload: int = 5
    chat_per_minute: int = int(os.getenv("CHAT_PER_MINUTE", "20"))
    upload_per_minute: int = 10
    # Backstop for the whole service, whatever the client IP says.
    global_chat_per_minute: int = int(os.getenv("GLOBAL_CHAT_PER_MINUTE", "120"))

    # Deployment. Browser origins allowed to call the API (comma-separated).
    allowed_origins: tuple[str, ...] = _list(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    )
    # Behind a proxy (Railway), take the client IP from X-Real-IP instead of the socket.
    trust_proxy: bool = _flag("TRUST_PROXY")
    db_view_limit: int = 100
    samples_dir: Path = Path(__file__).resolve().parent.parent / "samples"


settings = Settings()
