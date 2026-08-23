"""Make the ``api/`` modules importable by their top-level names in tests."""

import os
import sys

_API_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api"))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)
