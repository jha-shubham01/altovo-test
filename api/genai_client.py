"""Lazy Gemini (``google-genai``) client factory.

The client is created on first use, never at import time, so the app imports
cleanly without ``GEMINI_API_KEY`` set (D17: the human owns the keys). Both
``embedding`` and ``gemini`` share this single client.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import config
from errors import AppError

if TYPE_CHECKING:  # pragma: no cover - typing only
    from google.genai import Client

_client: Client | None = None


def get_genai_client() -> Client:
    """Return a process-wide Gemini client, creating it on first call.

    Raises :class:`AppError` (503) at call time — not import time — when the
    API key is absent, so imports and tests never require secrets.
    """
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise AppError(
                "config_error",
                "GEMINI_API_KEY is not configured on the server.",
                503,
            )
        # Imported lazily so the package imports without the SDK's env checks.
        import httpx
        from google import genai
        from google.genai import types

        # Two transport guards, both learned from live debugging:
        # - local_address="0.0.0.0" pins httpx to IPv4. The resolver here
        #   intermittently returns IPv6 first; httpx has no happy-eyeballs, so
        #   an unroutable IPv6 route hangs the request forever (curl raced
        #   both families and always worked).
        # - an explicit timeout so a bad route fails fast and surfaces as an
        #   error event instead of a stuck stream.
        _client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(
                timeout=config.GENAI_HTTP_TIMEOUT_SECONDS * 1000,  # SDK takes ms
                client_args={
                    "transport": httpx.HTTPTransport(local_address="0.0.0.0"),
                },
            ),
        )
    return _client
