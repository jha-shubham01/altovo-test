"""Document parsing: bytes -> location-aware :class:`Segment` list (D8).

PDFs are parsed page-by-page (one segment per page, so char spans stay within
the page text for the highlight lookup). DOCX/TXT/MD have no pages, so they are
segmented by nearest heading (the ``section`` column) with page left null.

Parsing is import-light: heavy libraries (PyMuPDF, python-docx) are imported
lazily inside each branch so the package imports without them present.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field

import config
from chunking import Segment
from errors import AppError


@dataclass
class ParsedDoc:
    segments: list[Segment] = field(default_factory=list)
    page_count: int | None = None


def parse_document(raw: bytes, ext: str) -> ParsedDoc:
    """Dispatch to the right parser by canonical extension."""
    ext = ext.lower().lstrip(".")
    if ext == "pdf":
        return _parse_pdf(raw)  # bounded by MAX_PAGES
    if ext == "docx":
        return _enforce_text_budget(_parse_docx(raw))
    if ext in ("txt", "md"):
        return _enforce_text_budget(
            _parse_text(raw.decode("utf-8", errors="replace"), markdown=(ext == "md"))
        )
    raise AppError("unsupported_type", f"Cannot parse '{ext}' documents.", 415)


def _enforce_text_budget(parsed: ParsedDoc) -> ParsedDoc:
    """Cap non-PDF documents by total text length (D18 time-budget analog).

    PDFs are bounded by MAX_PAGES; page-less docs (txt/md/docx) would otherwise
    be limited only by the 15 MB byte cap, and a large plaintext dump could blow
    the 300s ingest budget. Reject over-cap with a clear message.
    """
    total = sum(len(seg.text) for seg in parsed.segments)
    if total > config.MAX_TEXT_CHARS:
        raise AppError(
            "document_too_large",
            f"Document text is {total:,} characters; the limit is "
            f"{config.MAX_TEXT_CHARS:,}. Split it into smaller files.",
            413,
        )
    return parsed


# --- PDF ------------------------------------------------------------------


def _parse_pdf(raw: bytes) -> ParsedDoc:
    import fitz  # PyMuPDF

    try:
        doc = fitz.open(stream=raw, filetype="pdf")
    except Exception as err:
        raise AppError("parse_failed", "Could not read the PDF.", 422) from err

    try:
        page_count = doc.page_count
        if page_count > config.MAX_PAGES:
            raise AppError(
                "too_many_pages",
                f"PDF has {page_count} pages; the limit is {config.MAX_PAGES}.",
                413,
            )
        segments: list[Segment] = []
        for index in range(page_count):
            text = doc.load_page(index).get_text("text")
            if text.strip():
                segments.append(Segment(text=text, page=index + 1, section=None))
    finally:
        doc.close()

    if not segments:
        raise AppError(
            "no_text",
            "No selectable text found (the PDF may be scanned images — OCR is not supported).",
            422,
        )
    return ParsedDoc(segments=segments, page_count=page_count)


# --- DOCX -----------------------------------------------------------------


def _parse_docx(raw: bytes) -> ParsedDoc:
    import docx  # python-docx

    try:
        document = docx.Document(io.BytesIO(raw))
    except Exception as err:
        raise AppError("parse_failed", "Could not read the DOCX file.", 422) from err

    segments: list[Segment] = []
    current_section: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        text = "\n\n".join(b for b in buffer if b.strip())
        if text.strip():
            segments.append(Segment(text=text, page=None, section=current_section))
        buffer.clear()

    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = (para.style.name or "") if para.style else ""
        if style.startswith("Heading") or style == "Title":
            flush()
            current_section = text
            # The heading itself is useful context; keep it in the section text.
            buffer.append(text)
        else:
            buffer.append(text)
    flush()

    if not segments:
        raise AppError("no_text", "The DOCX file contains no readable text.", 422)
    return ParsedDoc(segments=segments, page_count=None)


# --- TXT / MD -------------------------------------------------------------


def _parse_text(text: str, markdown: bool) -> ParsedDoc:
    if not text.strip():
        raise AppError("no_text", "The file contains no readable text.", 422)

    if not markdown:
        return ParsedDoc(segments=[Segment(text=text, page=None, section=None)], page_count=None)

    # Markdown: split into segments at ATX headings; the heading becomes the
    # section label for everything under it until the next heading.
    segments: list[Segment] = []
    current_section: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        block = "\n".join(buffer)
        if block.strip():
            segments.append(Segment(text=block, page=None, section=current_section))
        buffer.clear()

    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("#"):
            flush()
            current_section = stripped.lstrip("#").strip() or current_section
        buffer.append(line)
    flush()

    if not segments:
        segments = [Segment(text=text, page=None, section=None)]
    return ParsedDoc(segments=segments, page_count=None)
