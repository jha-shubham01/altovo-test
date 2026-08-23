"""Ingestion pipeline (Phase 1).

Orchestrates: download from Storage -> magic-byte + size re-validation ->
page-aware parse -> chunk (with char spans) -> embed (RETRIEVAL_DOCUMENT, batched)
-> insert. A document row is created only once the file has parsed into at least
one chunk, so rejected files (wrong type, too many pages, no text) return a clean
4xx with no orphan row; failures during embedding mark the row ``failed``.
"""

from __future__ import annotations

from typing import Any

import config
import db
import security
from chunking import Chunk, Segment, chunk_segments
from errors import AppError
from parsing import parse_document

_EXT_TO_MIME = {ext: mime for mime, ext in config.ALLOWED_MIME_TYPES.items()}


def _chunk_rows(
    document_id: str, chunks: list[Chunk], embeddings: list[list[float]]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for chunk, vector in zip(chunks, embeddings, strict=True):
        rows.append(
            {
                "document_id": document_id,
                "chunk_index": chunk.chunk_index,
                "page": chunk.page,
                "section": chunk.section,
                "char_start": chunk.char_start,
                "char_end": chunk.char_end,
                "content": chunk.content,
                "token_count": chunk.token_count,
                "embedding": db.to_vector_literal(vector),
            }
        )
    return rows


def _persist(
    segments: list[Segment],
    page_count: int | None,
    *,
    filename: str,
    source_type: str,
    mime_type: str,
    size_bytes: int | None,
    storage_path: str | None,
    source_url: str | None,
) -> dict[str, Any]:
    """Chunk, embed and store a parsed document; return the ready Document row."""
    chunks = chunk_segments(segments)
    if not chunks:
        raise AppError("no_text", "No usable text was found to index.", 422)

    doc = db.insert_document(
        {
            "filename": filename,
            "source_type": source_type,
            "source_url": source_url,
            "storage_path": storage_path,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "page_count": page_count,
            "status": "processing",
        }
    )
    document_id = str(doc["id"])

    try:
        # Lazy import keeps the SDK off the import path for tests.
        from embedding import embed_documents

        embeddings = embed_documents([c.content for c in chunks])
        db.insert_chunks(_chunk_rows(document_id, chunks, embeddings))
        db.update_document(document_id, {"status": "ready"})
    except AppError as err:
        db.update_document(document_id, {"status": "failed", "error": err.message})
        raise
    except Exception as err:
        db.update_document(document_id, {"status": "failed", "error": "Ingestion failed."})
        raise AppError("ingest_failed", "Ingestion failed while indexing.", 502) from err

    return {**doc, "page_count": page_count, "status": "ready"}


def ingest_stored_upload(path: str, filename: str) -> dict[str, Any]:
    """Ingest a user upload already sitting in Storage at ``path`` (Phase 1)."""
    safe_name = security.sanitize_filename(filename)
    raw = db.download_bytes(path)
    declared_ext = security.extension_from_filename(safe_name)
    ext = security.validate_bytes(raw, declared_ext)

    parsed = parse_document(raw, ext)
    return _persist(
        parsed.segments,
        parsed.page_count,
        filename=safe_name,
        source_type="upload",
        mime_type=_EXT_TO_MIME.get(ext, "application/octet-stream"),
        size_bytes=len(raw),
        storage_path=path,
        source_url=None,
    )


def ingest_downloaded_file(
    raw: bytes, filename: str, source_url: str, storage_path: str | None
) -> dict[str, Any]:
    """Ingest a file fetched from a URL (Phase 4). Re-validates the bytes."""
    safe_name = security.sanitize_filename(filename)
    declared_ext = security.extension_from_filename(safe_name)
    ext = security.validate_bytes(raw, declared_ext)
    parsed = parse_document(raw, ext)
    return _persist(
        parsed.segments,
        parsed.page_count,
        filename=safe_name,
        source_type="url",
        mime_type=_EXT_TO_MIME.get(ext, "application/octet-stream"),
        size_bytes=len(raw),
        storage_path=storage_path,
        source_url=source_url,
    )


def ingest_extracted_page(text: str, filename: str, source_url: str) -> dict[str, Any]:
    """Ingest main-content text extracted from an HTML page (Phase 4).

    No storage object is kept — the page is stored only as chunks. Segmented as
    a single section-less block (headings were flattened during extraction).
    """
    segments = [Segment(text=text, page=None, section=None)]
    return _persist(
        segments,
        None,
        filename=security.sanitize_filename(filename),
        source_type="url",
        mime_type="text/plain",
        size_bytes=len(text.encode("utf-8")),
        storage_path=None,
        source_url=source_url,
    )
