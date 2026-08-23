"""Typed application errors.

Business logic raises :class:`AppError`; the FastAPI handlers in ``index.py``
render it as the single wire error shape ``{error: {code, message}}``.
"""

from __future__ import annotations


class AppError(Exception):
    """An error with a stable machine code, a user-facing message and a status.

    ``code`` is a short snake_case identifier the frontend can switch on.
    ``message`` is safe to show a user (never contains secrets or raw content).
    ``status`` is the HTTP status the handler should return.
    """

    def __init__(self, code: str, message: str, status: int = 400) -> None:
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)
