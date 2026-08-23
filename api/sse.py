"""Server-Sent Events framing for the ``/ask`` stream.

Every frame is ``event: <type>\\ndata: <json>\\n\\n``. The JSON payload always
carries a ``type`` field equal to the event name, because that is the field the
frontend parser (``frontend/lib/api.ts`` / ``AskEvent`` in ``types.ts``) keys
on. The ``event:`` line is included too, but the ``type`` field is the contract.
"""

from __future__ import annotations

import json
from typing import Any

from models import Citation, RetrievedSource


def _frame(event_type: str, payload: dict[str, Any]) -> str:
    data: dict[str, Any] = {"type": event_type, **payload}
    body = json.dumps(data, ensure_ascii=False)
    return f"event: {event_type}\ndata: {body}\n\n"


def sources_event(
    sources: list[RetrievedSource], weak_match: bool, not_found: bool
) -> str:
    """First event: the retrieved passages (retrieval precedes generation)."""
    return _frame(
        "sources",
        {
            "sources": [s.model_dump() for s in sources],
            "weak_match": weak_match,
            "not_found": not_found,
        },
    )


def delta_event(text: str) -> str:
    """A streamed chunk of generated answer text."""
    return _frame("delta", {"text": text})


def citations_event(citations: list[Citation]) -> str:
    """The validated ``[n]`` -> chunk map (provisional chips reconciled here)."""
    return _frame("citations", {"citations": [c.model_dump() for c in citations]})


def done_event() -> str:
    """Terminal success event."""
    return _frame("done", {})


def error_event(code: str, message: str) -> str:
    """Terminal failure event (mid-stream errors surface here, not as HTTP)."""
    return _frame("error", {"code": code, "message": message})
