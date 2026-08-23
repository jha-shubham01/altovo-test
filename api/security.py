"""Security helpers: magic-byte sniffing, filename sanitisation, SSRF guards.

The client-declared content-type cannot be trusted (security-baseline). The
stored object is re-sniffed against the allowlist before parsing, filenames are
stripped of anything that could traverse or inject, and outbound URL fetches are
blocked from reaching private / loopback / link-local / metadata addresses.
"""

from __future__ import annotations

import io
import ipaddress
import re
import socket
import unicodedata
import zipfile
from urllib.parse import urlparse

import config
from errors import AppError

_ZIP_MAGIC = b"PK\x03\x04"
_PDF_MAGIC = b"%PDF"
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


# --- Filename sanitisation ------------------------------------------------


def sanitize_filename(name: str) -> str:
    """Reduce a user-supplied filename to a safe, display-only basename.

    Strips directory components, control characters and leading dots. Storage
    paths are uuid-prefixed separately, so this is defence-in-depth for display
    and for the object key's trailing segment.
    """
    # Drop any path components (handle both separators regardless of OS).
    base = name.replace("\\", "/").split("/")[-1]
    base = unicodedata.normalize("NFC", base)
    base = _CONTROL_CHARS.sub("", base)
    base = base.strip().lstrip(".")
    # Collapse whitespace runs.
    base = re.sub(r"\s+", " ", base)
    if not base:
        base = "document"
    return base[:255]


# --- Magic-byte type detection --------------------------------------------


def _looks_like_text(raw: bytes) -> bool:
    """True if bytes decode as UTF-8 and are not obviously binary."""
    if b"\x00" in raw:
        return False
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def _is_docx(raw: bytes) -> bool:
    """A .docx is a zip whose entries include the ``word/`` part."""
    if not raw.startswith(_ZIP_MAGIC):
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            names = zf.namelist()
    except zipfile.BadZipFile:
        return False
    return any(n.startswith("word/") for n in names)


def sniff_type(raw: bytes, declared_ext: str) -> str | None:
    """Return the canonical extension inferred from bytes, or ``None``.

    ``pdf`` and ``docx`` are detected structurally. Text formats cannot be told
    apart from bytes alone, so a text-looking payload resolves to the declared
    extension when that is ``txt`` or ``md``.
    """
    if raw.startswith(_PDF_MAGIC):
        return "pdf"
    if _is_docx(raw):
        return "docx"
    if _looks_like_text(raw):
        if declared_ext in ("txt", "md"):
            return declared_ext
        return "txt"
    return None


def validate_bytes(raw: bytes, declared_ext: str) -> str:
    """Re-validate a stored object before parsing; return the canonical ext.

    Enforces the size cap and confirms the real type matches an allowlisted
    extension compatible with what was declared. Raises :class:`AppError`.
    """
    if len(raw) == 0:
        raise AppError("empty_file", "The uploaded file is empty.", 422)
    if len(raw) > config.MAX_FILE_BYTES:
        raise AppError(
            "file_too_large",
            f"File exceeds the {config.MAX_FILE_BYTES // (1024 * 1024)} MB limit.",
            413,
        )

    declared_ext = declared_ext.lower().lstrip(".")
    if declared_ext not in config.ALLOWED_EXTENSIONS:
        raise AppError(
            "unsupported_type",
            "Only PDF, DOCX, TXT and MD files are supported.",
            415,
        )

    sniffed = sniff_type(raw, declared_ext)
    if sniffed is None:
        raise AppError(
            "unsupported_type",
            "The file content does not match a supported type.",
            415,
        )

    # PDF/DOCX must match exactly; the two text formats are interchangeable.
    text_formats = {"txt", "md"}
    compatible = sniffed == declared_ext or (
        sniffed in text_formats and declared_ext in text_formats
    )
    if not compatible:
        raise AppError(
            "type_mismatch",
            f"File content ({sniffed}) does not match its extension "
            f"({declared_ext}).",
            415,
        )
    return sniffed


def extension_from_filename(filename: str) -> str:
    """Lowercase extension without the dot, or empty string."""
    _, _, ext = filename.rpartition(".")
    return ext.lower() if "." in filename else ""


def guess_extension(filename: str, mime: str) -> str:
    """Best-effort canonical extension from filename first, then MIME."""
    ext = extension_from_filename(filename)
    if ext in config.ALLOWED_EXTENSIONS:
        return ext
    return config.ALLOWED_MIME_TYPES.get(mime, "")


# --- SSRF guards ----------------------------------------------------------


def is_blocked_ip(ip_text: str) -> bool:
    """True for any address that must never be reached from a server fetch.

    Blocks private, loopback, link-local (incl. the 169.254.169.254 metadata
    endpoint), reserved, multicast and unspecified ranges for IPv4 and IPv6,
    including IPv4-mapped IPv6.
    """
    try:
        ip = ipaddress.ip_address(ip_text)
    except ValueError:
        # Unparseable address: treat as unsafe.
        return True

    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped

    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def resolve_public_ips(host: str) -> list[str]:
    """Resolve a hostname to IPs, raising if any resolved address is blocked.

    Every resolved address must be public — a hostname that resolves to a mix
    of public and private targets is rejected outright (rebinding defence).
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as err:
        raise AppError("url_unresolvable", f"Could not resolve host: {host}.", 400) from err

    ips = {info[4][0] for info in infos}
    if not ips:
        raise AppError("url_unresolvable", f"Could not resolve host: {host}.", 400)
    for ip in ips:
        if is_blocked_ip(ip):
            raise AppError(
                "url_blocked",
                "Refusing to fetch a private, loopback or link-local address.",
                400,
            )
    return sorted(ips)


def assert_url_fetchable(url: str) -> str:
    """Validate scheme + host of a URL and confirm it resolves to public IPs.

    Returns the hostname. Raises :class:`AppError` on any violation.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise AppError("url_invalid", "Only http and https URLs are allowed.", 400)
    host = parsed.hostname
    if not host:
        raise AppError("url_invalid", "URL is missing a host.", 400)
    resolve_public_ips(host)
    return host
