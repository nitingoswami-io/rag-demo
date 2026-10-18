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


_SCOPE = """
    FROM langchain_pg_embedding e
    JOIN langchain_pg_collection c ON c.uuid = e.collection_id
    WHERE c.name = :name AND e.cmetadata->>'source' = :source
"""


def stored_hashes(source: str) -> set[str | None]:
    """File hashes currently stored for a filename (None for chunks without one)."""
    get_vector_store()
    query = text(f"SELECT DISTINCT e.cmetadata->>'file_hash' AS h {_SCOPE}")
    with _engine().connect() as conn:
        rows = conn.execute(query, {"name": settings.collection, "source": source})
        return {r.h for r in rows}


def delete_stale(source: str, keep_hash: str) -> int:
    """Delete chunks of a filename that belong to an older version. Returns rows deleted."""
    query = text(
        """
        DELETE FROM langchain_pg_embedding e
        USING langchain_pg_collection c
        WHERE c.uuid = e.collection_id AND c.name = :name
          AND e.cmetadata->>'source' = :source
          AND e.cmetadata->>'file_hash' IS DISTINCT FROM :keep
        """
    )
    with _engine().begin() as conn:
        result = conn.execute(
            query, {"name": settings.collection, "source": source, "keep": keep_hash}
        )
        return result.rowcount


def delete_source(source: str) -> int:
    """Delete every chunk (text + embedding) of a filename. Returns rows deleted."""
    get_vector_store()
    query = text(
        """
        DELETE FROM langchain_pg_embedding e
        USING langchain_pg_collection c
        WHERE c.uuid = e.collection_id AND c.name = :name
          AND e.cmetadata->>'source' = :source
        """
    )
    with _engine().begin() as conn:
        return conn.execute(query, {"name": settings.collection, "source": source}).rowcount


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
