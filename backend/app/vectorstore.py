"""Semantic memory: a pgvector collection behind LangChain's PGVector store."""

from functools import lru_cache

from langchain_openai import OpenAIEmbeddings
from langchain_postgres import PGVector
from sqlalchemy import create_engine, text

from .config import settings

UPLOADS_PACK = "uploads"


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


_FROM = """
    FROM langchain_pg_embedding e
    JOIN langchain_pg_collection c ON c.uuid = e.collection_id
    WHERE c.name = :name
"""


def _rows(sql: str, **params):
    get_vector_store()  # make sure tables exist
    with _engine().connect() as conn:
        return conn.execute(text(sql), {"name": settings.collection, **params}).all()


def _write(sql: str, **params) -> int:
    get_vector_store()
    with _engine().begin() as conn:
        return conn.execute(text(sql), {"name": settings.collection, **params}).rowcount


def stored_versions(source: str) -> set[tuple[str | None, str | None]]:
    """(file_hash, pack) pairs currently stored for a filename."""
    rows = _rows(
        f"""SELECT DISTINCT e.cmetadata->>'file_hash' AS h, e.cmetadata->>'pack' AS p
            {_FROM} AND e.cmetadata->>'source' = :source""",
        source=source,
    )
    return {(r.h, r.p) for r in rows}


def delete_stale(source: str, keep_hash: str) -> int:
    """Delete chunks of a filename that belong to an older version."""
    return _write(
        """DELETE FROM langchain_pg_embedding e USING langchain_pg_collection c
           WHERE c.uuid = e.collection_id AND c.name = :name
             AND e.cmetadata->>'source' = :source
             AND e.cmetadata->>'file_hash' IS DISTINCT FROM :keep""",
        source=source,
        keep=keep_hash,
    )


def delete_source(source: str) -> int:
    """Delete every chunk (text + embedding) of a filename. Returns rows deleted."""
    return _write(
        """DELETE FROM langchain_pg_embedding e USING langchain_pg_collection c
           WHERE c.uuid = e.collection_id AND c.name = :name
             AND e.cmetadata->>'source' = :source""",
        source=source,
    )


def tag_untagged(pack: str) -> int:
    """Older chunks have no pack; assign them one so they stay reachable."""
    return _write(
        """UPDATE langchain_pg_embedding e SET cmetadata = e.cmetadata || jsonb_build_object('pack', CAST(:pack AS text))
           FROM langchain_pg_collection c
           WHERE c.uuid = e.collection_id AND c.name = :name AND e.cmetadata->>'pack' IS NULL""",
        pack=pack,
    )


def pack_documents(pack: str) -> list[dict]:
    """Documents in a pack with their chunk and page counts."""
    rows = _rows(
        f"""SELECT e.cmetadata->>'source' AS source, count(*) AS chunks,
                   count(DISTINCT e.cmetadata->>'page') AS pages
            {_FROM} AND e.cmetadata->>'pack' = :pack
            GROUP BY 1 ORDER BY 1""",
        pack=pack,
    )
    return [{"filename": r.source, "chunks": r.chunks, "pages": r.pages or None} for r in rows]


def count_chunks(pack: str) -> int:
    return _rows(f"SELECT count(*) AS n {_FROM} AND e.cmetadata->>'pack' = :pack", pack=pack)[0].n


def pack_rows(pack: str, limit: int) -> list[dict]:
    """Raw rows of langchain_pg_embedding for one pack (read-only view)."""
    rows = _rows(
        f"""SELECT e.id, e.document, e.cmetadata AS meta,
                   vector_dims(e.embedding) AS dims,
                   left(e.embedding::text, 120) AS vec
            {_FROM} AND e.cmetadata->>'pack' = :pack
            ORDER BY e.cmetadata->>'source', (e.cmetadata->>'page')::int NULLS FIRST,
                     (e.cmetadata->>'chunk')::int NULLS FIRST
            LIMIT :limit""",
        pack=pack,
        limit=limit,
    )
    out = []
    for r in rows:
        preview = [round(float(x), 4) for x in r.vec.strip("[]").split(",")[:5] if x.strip()]
        out.append(
            {
                "id": r.id,
                "source": r.meta.get("source"),
                "page": r.meta.get("page"),
                "chunk": r.meta.get("chunk"),
                "file_hash": (r.meta.get("file_hash") or "")[:12] or None,
                "chars": len(r.document),
                "dims": r.dims,
                "embedding_preview": preview,
                "text": r.document[:240],
            }
        )
    return out
