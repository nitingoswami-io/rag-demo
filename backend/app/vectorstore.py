"""Semantic memory: a pgvector collection behind LangChain's PGVector store."""

from functools import lru_cache

from langchain_openai import OpenAIEmbeddings
from langchain_postgres import PGVector
from sqlalchemy import create_engine, text

from .config import settings


@lru_cache
def get_vector_store() -> PGVector:
    embeddings = OpenAIEmbeddings(model=settings.embedding_model)
    # Creates the `vector` extension and LangChain's tables on first use.
    return PGVector(
        embeddings=embeddings,
        collection_name=settings.collection,
        connection=settings.database_url,
        use_jsonb=True,
    )


@lru_cache
def _engine():
    return create_engine(settings.database_url)


def list_sources() -> list[str]:
    """Distinct filenames stored in the collection."""
    get_vector_store()  # make sure tables exist
    query = text(
        """
        SELECT DISTINCT e.cmetadata->>'source' AS source
        FROM langchain_pg_embedding e
        JOIN langchain_pg_collection c ON c.uuid = e.collection_id
        WHERE c.name = :name
        ORDER BY source
        """
    )
    with _engine().connect() as conn:
        rows = conn.execute(query, {"name": settings.collection})
        return [r.source for r in rows if r.source]
