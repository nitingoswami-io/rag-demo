"""App settings, loaded from backend/.env."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _flag(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg://rag:rag@localhost:5432/rag"
    )
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
    db_view_limit: int = 100
    samples_dir: Path = Path(__file__).resolve().parent.parent / "samples"


settings = Settings()
