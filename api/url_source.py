"""URL data source (Phase 4, D12).

Paste a URL: a direct file link is downloaded (size-capped) and run through the
normal ingest pipeline; an HTML page has its main content extracted (trafilatura)
and ingested as one document, and same-domain linked documents are listed as
candidates for the user to confirm (no recursive crawling).

Every outbound fetch is SSRF-guarded: the host must resolve to public IPs, and
every redirect hop is re-checked (security.py).
"""

from __future__ import annotations

import re
import uuid
from urllib.parse import urljoin, urlparse

import config
import db
import security
from errors import AppError
from ingest import ingest_downloaded_file, ingest_extracted_page
from models import Document, FromUrlResponse, LinkedDocCandidate

_DOC_EXTENSIONS = ("pdf", "docx", "txt", "md")
_HREF_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.IGNORECASE)


def _basename_from_url(url: str, fallback: str) -> str:
    path = urlparse(url).path
    name = path.rstrip("/").split("/")[-1] if path else ""
    return name or fallback


def _looks_like_doc_link(url: str) -> bool:
    ext = security.extension_from_filename(urlparse(url).path)
    return ext in _DOC_EXTENSIONS


def _safe_fetch(url: str) -> tuple[str, str, bytes]:
    """Fetch a URL following redirects, re-checking SSRF safety at each hop.

    Returns ``(final_url, content_type, body)``. Enforces the download size cap
    by reading incrementally and aborting past the ceiling.
    """
    import httpx

    current = url
    with httpx.Client(follow_redirects=False, timeout=config.URL_FETCH_TIMEOUT_SECONDS) as client:
        for _ in range(config.URL_MAX_REDIRECT_HOPS):
            security.assert_url_fetchable(current)
            with client.stream("GET", current) as resp:
                if resp.is_redirect:
                    location = resp.headers.get("location")
                    if not location:
                        raise AppError("url_fetch_failed", "Broken redirect from the URL.", 400)
                    current = urljoin(current, location)
                    continue
                if resp.status_code >= 400:
                    raise AppError(
                        "url_fetch_failed",
                        f"The URL returned status {resp.status_code}.",
                        400,
                    )
                content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                data = bytearray()
                for chunk in resp.iter_bytes():
                    data += chunk
                    if len(data) > config.URL_MAX_DOWNLOAD_BYTES:
                        raise AppError(
                            "file_too_large",
                            f"The linked file exceeds the "
                            f"{config.URL_MAX_DOWNLOAD_BYTES // (1024 * 1024)} MB limit.",
                            413,
                        )
                return current, content_type, bytes(data)
    raise AppError("too_many_redirects", "The URL redirected too many times.", 400)


def _extract_candidates(html: str, base_url: str) -> list[LinkedDocCandidate]:
    """Same-domain links to document files, de-duplicated and capped (D12)."""
    base_host = urlparse(base_url).hostname
    seen: set[str] = set()
    candidates: list[LinkedDocCandidate] = []
    for href in _HREF_RE.findall(html):
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https"):
            continue
        if parsed.hostname != base_host:
            continue
        if not _looks_like_doc_link(absolute):
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        candidates.append(
            LinkedDocCandidate(url=absolute, label=_basename_from_url(absolute, absolute))
        )
        if len(candidates) >= config.MAX_LINKED_DOC_CANDIDATES:
            break
    return candidates


def handle_url(url: str) -> FromUrlResponse:
    """Entry point for ``POST /documents/from-url``."""
    final_url, content_type, body = _safe_fetch(url)

    is_html = content_type.startswith("text/html") or content_type == "application/xhtml+xml"
    if is_html and not _looks_like_doc_link(final_url):
        html = body.decode("utf-8", errors="replace")
        import trafilatura

        extracted = trafilatura.extract(html, url=final_url, favor_recall=True)
        candidates = _extract_candidates(html, final_url)
        if not extracted or not extracted.strip():
            if candidates:
                return FromUrlResponse(document=None, candidates=candidates)
            raise AppError(
                "no_text",
                "Could not extract readable content from that page.",
                422,
            )
        title = _page_title(html) or _basename_from_url(final_url, "web page")
        doc = ingest_extracted_page(extracted, title, final_url)
        return FromUrlResponse(
            document=Document(**doc),
            candidates=candidates or None,
        )

    # Direct file: store it so the viewer/file endpoints work, then ingest.
    filename = _basename_from_url(final_url, "document")
    safe_name = security.sanitize_filename(filename)
    storage_path = f"{uuid.uuid4().hex}/{safe_name}"
    try:
        db.upload_bytes(storage_path, body, content_type or "application/octet-stream")
    except Exception:  # noqa: BLE001 - storage is best-effort for URL files
        storage_path = None
    doc = ingest_downloaded_file(body, safe_name, final_url, storage_path)
    return FromUrlResponse(document=Document(**doc), candidates=None)


_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


def _page_title(html: str) -> str | None:
    m = _TITLE_RE.search(html)
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1)).strip() or None
