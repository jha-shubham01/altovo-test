"""FastAPI ASGI entrypoint (Vercel Python function).

All routes live under ``/api`` so they match both local dev (``uvicorn index:app``
serving ``/api/*``) and the Vercel rewrite that sends ``/api/(.*)`` to this
function (D3). Every error is rendered as the single wire shape
``{error: {code, message}}``.
"""

from __future__ import annotations

import uuid

import config
import db
import security
from ask import stream_ask
from errors import AppError
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from models import (
    AskRequest,
    Document,
    FileUrlResponse,
    FromUrlRequest,
    IngestRequest,
    SignUploadRequest,
    SignUploadResponse,
)

app = FastAPI(title="Altovo DocQA API", docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Error handlers (single wire shape) -----------------------------------


def _error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(AppError)
async def _handle_app_error(_: Request, exc: AppError) -> JSONResponse:
    return _error(exc.code, exc.message, exc.status)


@app.exception_handler(RequestValidationError)
async def _handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = first.get("msg", "Invalid request.")
    message = f"{field}: {msg}" if field else msg
    return _error("validation_error", message, 422)


@app.exception_handler(Exception)
async def _handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
    # Never leak internals; log-worthy detail stays server-side.
    return _error("internal_error", "Something went wrong on the server.", 500)


# --- Health ---------------------------------------------------------------


@app.get("/api/health")
async def health() -> dict[str, object]:
    ok = False
    try:
        ok = db.health_check()
    except Exception:  # noqa: BLE001 - health must not 500 when unconfigured
        ok = False
    return {"status": "ok", "db": ok}


# --- Documents ------------------------------------------------------------


@app.get("/api/documents")
async def list_documents() -> list[Document]:
    return [Document(**row) for row in db.list_documents()]


@app.post("/api/documents/sign-upload")
async def sign_upload(body: SignUploadRequest) -> SignUploadResponse:
    # Advisory validation only — the stored object is re-validated at ingest.
    if body.size > config.MAX_FILE_BYTES:
        raise AppError(
            "file_too_large",
            f"File exceeds the {config.MAX_FILE_BYTES // (1024 * 1024)} MB limit.",
            413,
        )
    ext = security.guess_extension(body.filename, body.mime)
    if ext not in config.ALLOWED_EXTENSIONS:
        raise AppError("unsupported_type", "Only PDF, DOCX, TXT and MD files are supported.", 415)

    safe_name = security.sanitize_filename(body.filename)
    path = f"{uuid.uuid4().hex}/{safe_name}"
    signed = db.create_signed_upload_url(path)
    upload_url = signed.get("signed_url") or signed.get("signedUrl") or signed.get("signedURL")
    token = signed.get("token") or ""
    if not upload_url:
        raise AppError("storage_error", "Could not create an upload URL.", 502)
    return SignUploadResponse(path=path, upload_url=upload_url, token=token)


@app.post("/api/documents/ingest")
async def ingest(body: IngestRequest) -> Document:
    from ingest import ingest_stored_upload

    doc = ingest_stored_upload(body.path, body.filename)
    return Document(**doc)


@app.post("/api/documents/from-url")
async def from_url(body: FromUrlRequest):
    from url_source import handle_url

    return handle_url(body.url)


@app.delete("/api/documents/{document_id}", status_code=204, response_class=Response)
async def delete_document(document_id: str) -> Response:
    doc = db.get_document(document_id)
    if not doc:
        raise AppError("not_found", "Document not found.", 404)
    if doc.get("storage_path"):
        db.remove_object(doc["storage_path"])
    db.delete_document(document_id)
    return Response(status_code=204)


# --- Ask (SSE) ------------------------------------------------------------


@app.post("/api/ask")
async def ask(body: AskRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_ask(body.question, body.history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable proxy buffering so deltas flush
        },
    )


# --- Reset ----------------------------------------------------------------


@app.post("/api/reset", status_code=204, response_class=Response)
async def reset() -> Response:
    db.reset_all()
    return Response(status_code=204)


# --- Stretch: highlight + file (Phase 6) ----------------------------------


@app.get("/api/documents/{document_id}/highlight")
async def highlight(document_id: str, chunk_id: int):
    from highlight import highlight_chunk

    return highlight_chunk(document_id, chunk_id)


@app.get("/api/documents/{document_id}/file")
async def file_url(document_id: str) -> FileUrlResponse:
    doc = db.get_document(document_id)
    if not doc or not doc.get("storage_path"):
        raise AppError("not_found", "No file is available for this document.", 404)
    return FileUrlResponse(url=db.create_signed_url(doc["storage_path"], expires_in=300))
