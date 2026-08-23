"""PDF citation highlight (stretch, Phase 6, D11).

Highlighting is a **lookup, not a search**: the chunk's char span (recorded at
ingest) recovers the exact text on the page, which is then located with
per-sentence ``page.search_for`` and the rects are unioned. Short needles match
reliably where a whole 450-token needle would miss on hyphenation/ligatures.
The ladder ends at empty rects, which tells the frontend to fall back to the
snippet panel — we never return a wrong highlight.
"""

from __future__ import annotations

import re

import config
import db
from errors import AppError
from models import HighlightResponse, Rect

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def _needles(text: str) -> list[str]:
    parts: list[str] = []
    for sentence in _SENTENCE_RE.split(text):
        s = " ".join(sentence.split())
        if len(s) < config.HIGHLIGHT_MIN_NEEDLE:
            continue
        if len(s) > config.HIGHLIGHT_MAX_NEEDLE:
            s = s[:config.HIGHLIGHT_MAX_NEEDLE].rsplit(" ", 1)[0]
        parts.append(s)
    return parts


def highlight_chunk(document_id: str, chunk_id: int) -> HighlightResponse:
    doc = db.get_document(document_id)
    if not doc:
        raise AppError("not_found", "Document not found.", 404)
    if (doc.get("mime_type") or "") != "application/pdf" or not doc.get("storage_path"):
        # Non-PDF docs have no page rects — the frontend cites by section.
        return HighlightResponse(page=None, page_w=None, page_h=None, rects=[])

    chunk = db.get_chunk(chunk_id)
    if not chunk or str(chunk["document_id"]) != str(document_id):
        raise AppError("not_found", "Citation not found.", 404)

    page_no = chunk.get("page")
    if not page_no:
        return HighlightResponse(page=None, page_w=None, page_h=None, rects=[])

    import fitz

    raw = db.download_bytes(doc["storage_path"])
    pdf = fitz.open(stream=raw, filetype="pdf")
    try:
        page = pdf.load_page(page_no - 1)
        page_rect = page.rect
        page_text = page.get_text("text")

        start = chunk.get("char_start")
        end = chunk.get("char_end")
        if isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(page_text):
            needle_source = page_text[start:end]
        else:
            needle_source = chunk.get("content", "")

        rects = _search_needles(page, _needles(needle_source))
        if not rects:
            rects = _fuzzy_recover(page, page_text, needle_source)

        return HighlightResponse(
            page=page_no,
            page_w=float(page_rect.width),
            page_h=float(page_rect.height),
            rects=rects,
        )
    finally:
        pdf.close()


def _search_needles(page, needles: list[str]) -> list[Rect]:
    rects: list[Rect] = []
    for needle in needles:
        try:
            for r in page.search_for(needle, quads=False):
                rects.append(
                    Rect(x=float(r.x0), y=float(r.y0), w=float(r.x1 - r.x0), h=float(r.y1 - r.y0))
                )
        except Exception:  # noqa: BLE001 - a bad needle must not fail the request
            continue
    return rects


def _fuzzy_recover(page, page_text: str, target: str) -> list[Rect]:
    """Last resort before giving up: use rapidfuzz to relocate the target text.

    Aligns the target against the page text; if a strong window is found, search
    for its opening clause. Returns [] on a weak match so the UI falls back.
    """
    try:
        from rapidfuzz import fuzz
    except Exception:  # noqa: BLE001
        return []

    opening = " ".join(target.split())[:config.HIGHLIGHT_MAX_NEEDLE].rsplit(" ", 1)[0]
    if len(opening) < config.HIGHLIGHT_MIN_NEEDLE:
        return []
    if fuzz.partial_ratio(opening.lower(), page_text.lower()) < 85:
        return []
    return _search_needles(page, [opening])
