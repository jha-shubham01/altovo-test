"""Pydantic models — the API contract (mirrored in frontend/lib/types.ts).

Every request/response body crossing the wire is typed here. The single error
shape is {error: {code, message}} (see index.py error handlers).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# --- Documents ------------------------------------------------------------

DocumentStatus = Literal["processing", "ready", "failed"]
SourceType = Literal["upload", "url"]


class Document(BaseModel):
    id: str
    filename: str
    source_type: SourceType
    source_url: str | None = None
    storage_path: str | None = None
    mime_type: str
    size_bytes: int | None = None
    page_count: int | None = None
    status: DocumentStatus
    error: str | None = None
    created_at: str


class SignUploadRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=512)
    size: int = Field(..., ge=1)
    mime: str


class SignUploadResponse(BaseModel):
    path: str
    upload_url: str
    token: str


class IngestRequest(BaseModel):
    path: str
    filename: str = Field(..., min_length=1, max_length=512)


class FromUrlRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)


class LinkedDocCandidate(BaseModel):
    url: str
    label: str


class FromUrlResponse(BaseModel):
    document: Document | None = None
    candidates: list[LinkedDocCandidate] | None = None


# --- Ask ------------------------------------------------------------------

Role = Literal["user", "assistant"]


class ChatTurn(BaseModel):
    role: Role
    content: str


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    # D13: last 6 turns (a turn = user+assistant exchange), i.e. up to 12 messages.
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)


class RetrievedSource(BaseModel):
    """Emitted in the `sources` SSE event (retrieval precedes generation)."""

    n: int                     # 1-indexed citation label
    chunk_id: int
    document_id: str
    filename: str
    page: int | None = None
    section: str | None = None
    snippet: str
    similarity: float          # raw cosine (drives the relevance band + caveat)
    rrf_score: float


class Citation(BaseModel):
    """Emitted in the validated `citations` SSE event ([n] -> chunk map)."""

    n: int
    chunk_id: int
    document_id: str
    filename: str
    page: int | None = None
    section: str | None = None


# --- Highlight (stretch, Phase 6) ----------------------------------------


class Rect(BaseModel):
    x: float
    y: float
    w: float
    h: float


class HighlightResponse(BaseModel):
    page: int | None = None
    page_w: float | None = None
    page_h: float | None = None
    rects: list[Rect] = Field(default_factory=list)  # [] ⇒ frontend falls back


class FileUrlResponse(BaseModel):
    url: str


# --- Errors ---------------------------------------------------------------


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
