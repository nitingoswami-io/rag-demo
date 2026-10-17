"""App settings, loaded from backend/.env."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


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


settings = Settings()
