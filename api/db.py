"""Supabase access layer — the ONLY module that talks to Postgres/Storage.

Everything goes through supabase-py (PostgREST + RPC + Storage), never a direct
psycopg/asyncpg connection: serverless would exhaust the pool (D7). The client
is created lazily on first use so the package imports without credentials (D17).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import config
from errors import AppError

if TYPE_CHECKING:  # pragma: no cover - typing only
    from supabase import Client

_client: Client | None = None

# A UUID that can never be a real row id, used to satisfy PostgREST's
# "delete needs a filter" rule when clearing every row.
_IMPOSSIBLE_ID = "00000000-0000-0000-0000-000000000000"


def get_client() -> Client:
    """Return a process-wide Supabase client, created on first call."""
    global _client
    if _client is None:
        if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
            raise AppError(
                "config_error",
                "Supabase is not configured on the server.",
                503,
            )
        from supabase import create_client

        _client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
    return _client


def to_vector_literal(vector: list[float]) -> str:
    """Render a float vector as the pgvector text literal ``[v1,v2,...]``.

    PostgREST casts this text to ``vector`` on insert and when passed as an RPC
    parameter, which avoids ambiguity with plain JSON arrays.
    """
    return "[" + ",".join(repr(float(v)) for v in vector) + "]"


# --- Documents ------------------------------------------------------------


def insert_document(row: dict[str, Any]) -> dict[str, Any]:
    res = get_client().table("documents").insert(row).execute()
    if not res.data:
        raise AppError("db_error", "Failed to create the document record.", 502)
    return res.data[0]


def update_document(document_id: str, fields: dict[str, Any]) -> None:
    get_client().table("documents").update(fields).eq("id", document_id).execute()


def list_documents() -> list[dict[str, Any]]:
    res = (
        get_client()
        .table("documents")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def get_documents_by_ids(document_ids: list[str]) -> list[dict[str, Any]]:
    """Fetch id + filename for a set of documents in one PostgREST round-trip."""
    if not document_ids:
        return []
    res = (
        get_client()
        .table("documents")
        .select("id, filename")
        .in_("id", document_ids)
        .execute()
    )
    return res.data or []


def get_document(document_id: str) -> dict[str, Any] | None:
    res = (
        get_client()
        .table("documents")
        .select("*")
        .eq("id", document_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def delete_document(document_id: str) -> None:
    # Chunks are removed by the ON DELETE CASCADE foreign key.
    get_client().table("documents").delete().eq("id", document_id).execute()


# --- Chunks ---------------------------------------------------------------


def insert_chunks(rows: list[dict[str, Any]]) -> None:
    """Insert chunk rows in modest batches (each row carries a 768-d vector)."""
    if not rows:
        return
    client = get_client()
    for start in range(0, len(rows), config.CHUNK_INSERT_BATCH):
        client.table("chunks").insert(rows[start : start + config.CHUNK_INSERT_BATCH]).execute()


def get_chunk(chunk_id: int) -> dict[str, Any] | None:
    res = (
        get_client()
        .table("chunks")
        .select("id, document_id, page, section, char_start, char_end, content")
        .eq("id", chunk_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


# --- Hybrid retrieval RPC (D7) -------------------------------------------


def rpc_hybrid_search(
    query_embedding: list[float],
    query_text: str,
    match_count: int,
    filter_document_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "query_embedding": to_vector_literal(query_embedding),
        "query_text": query_text,
        "match_count": match_count,
        "filter_document_ids": filter_document_ids,
    }
    res = get_client().rpc("hybrid_search", params).execute()
    return res.data or []


# --- Storage --------------------------------------------------------------


def create_signed_upload_url(path: str) -> dict[str, Any]:
    """Signed URL the browser PUTs the file to (bypasses the 4.5 MB body cap)."""
    return get_client().storage.from_(config.STORAGE_BUCKET).create_signed_upload_url(path)


def download_bytes(path: str) -> bytes:
    return get_client().storage.from_(config.STORAGE_BUCKET).download(path)


def create_signed_url(path: str, expires_in: int = 300) -> str:
    res = get_client().storage.from_(config.STORAGE_BUCKET).create_signed_url(path, expires_in)
    url = res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    if not url:
        raise AppError("storage_error", "Could not sign the file URL.", 502)
    return url


def upload_bytes(path: str, data: bytes, content_type: str) -> None:
    """Server-side upload (used for URL-sourced files, not user uploads)."""
    get_client().storage.from_(config.STORAGE_BUCKET).upload(
        path, data, {"content-type": content_type, "upsert": "true"}
    )


def remove_object(path: str) -> None:
    try:
        get_client().storage.from_(config.STORAGE_BUCKET).remove([path])
    except Exception:  # noqa: BLE001 - best-effort cleanup
        pass


# --- Reset (D14) ----------------------------------------------------------


def reset_all() -> None:
    """Delete every document (cascade drops chunks) and empty the bucket.

    Storage paths are collected from the documents table BEFORE the rows are
    deleted: objects live under uuid prefixes, and `bucket.list()` only returns
    top-level entries (removing a "folder" name deletes nothing), so listing
    the bucket would silently orphan every file.
    """
    client = get_client()
    res = client.table("documents").select("storage_path").execute()
    paths = [row["storage_path"] for row in (res.data or []) if row.get("storage_path")]
    client.table("documents").delete().neq("id", _IMPOSSIBLE_ID).execute()
    if paths:
        try:
            client.storage.from_(config.STORAGE_BUCKET).remove(paths)
        except Exception:  # noqa: BLE001 - best-effort; the tables are the source of truth
            pass


def health_check() -> bool:
    """Cheap reachability probe for the keepalive endpoint."""
    get_client().table("documents").select("id").limit(1).execute()
    return True
