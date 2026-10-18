"""Sample knowledge bases ("packs"): fictional documents for real-world use cases."""

import json
import logging
from functools import lru_cache

from .config import settings
from .ingest import ingest_file
from .vectorstore import UPLOADS_PACK, tag_untagged

log = logging.getLogger("rag.samples")


@lru_cache
def packs() -> list[dict]:
    return json.loads((settings.samples_dir / "packs.json").read_text())


@lru_cache
def sample_filenames() -> frozenset[str]:
    return frozenset(f for p in packs() for f in p["files"])


def pack_ids() -> set[str]:
    ids = {p["id"] for p in packs()}
    return ids | {UPLOADS_PACK} if settings.allow_uploads else ids


def seed() -> None:
    """Index every sample file. Unchanged files are skipped, so restarts are cheap."""
    for pack in packs():
        for name in pack["files"]:
            path = settings.samples_dir / pack["id"] / name
            try:
                chunks, status = ingest_file(str(path), name, pack["id"])
                log.info("sample %s/%s: %s (%d chunks)", pack["id"], name, status, chunks)
            except Exception as e:  # e.g. missing OpenAI key; the app still starts
                log.warning("could not index sample %s: %s", name, e)
    # Documents uploaded before packs existed belong to the uploads knowledge base.
    tag_untagged(UPLOADS_PACK)
