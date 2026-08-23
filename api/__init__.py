"""Altovo DocQA FastAPI backend package.

Modules import each other with plain top-level names (``import config``,
``from db import ...``) so the app works both when Vercel loads ``index.py``
directly (with ``api/`` on ``sys.path``) and when the test suite adds ``api/``
to ``sys.path`` via ``tests/conftest.py``.
"""
