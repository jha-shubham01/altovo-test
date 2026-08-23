"""Empirically calibrate SIM_FLOOR against real documents (D10).

Gemini cosine similarities cluster high, so the "not in the docs" floor must be
measured, not guessed. This helper ingests a folder of documents into a fresh
workspace (via the running API), asks a set of in-domain and out-of-domain
questions, and prints the raw best-cosine distribution so you can pick a floor
that cleanly separates the two.

Usage (with the API running and env configured):
    python scripts/calibrate_floor.py --docs ./samples \
        --in "What is the refund window?" "What is the uptime SLA?" \
        --out "What is the capital of France?" "How do I bake bread?"

This talks to the API over HTTP; it does not import server internals, so it
respects the same boundary the frontend uses. Requires `httpx`.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib

import httpx

API = os.environ.get("CALIBRATE_API_BASE", "http://localhost:8000")


def _best_similarity(question: str) -> float:
    """Ask a question and read the best raw cosine off the `sources` SSE event."""
    best = 0.0
    with httpx.stream(
        "POST",
        f"{API}/api/ask",
        json={"question": question, "history": []},
        timeout=120,
    ) as resp:
        for line in resp.iter_lines():
            if not line.startswith("data:"):
                continue
            payload = json.loads(line[len("data:") :].strip())
            if payload.get("type") == "sources":
                sims = [s["similarity"] for s in payload.get("sources", [])]
                best = max(sims) if sims else 0.0
                break
    return best


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--docs", type=pathlib.Path, required=False)
    parser.add_argument("--in", dest="in_q", nargs="*", default=[])
    parser.add_argument("--out", dest="out_q", nargs="*", default=[])
    args = parser.parse_args()

    if args.docs:
        print(f"NOTE: ingest the documents in {args.docs} via the UI or API first.")

    print("\n== in-domain (should clear the floor) ==")
    in_scores = [(q, _best_similarity(q)) for q in args.in_q]
    for q, s in in_scores:
        print(f"  {s:.3f}  {q}")

    print("\n== out-of-domain (should fall below the floor) ==")
    out_scores = [(q, _best_similarity(q)) for q in args.out_q]
    for q, s in out_scores:
        print(f"  {s:.3f}  {q}")

    if in_scores and out_scores:
        lo_in = min(s for _, s in in_scores)
        hi_out = max(s for _, s in out_scores)
        print(f"\nlowest in-domain = {lo_in:.3f}   highest out-of-domain = {hi_out:.3f}")
        if lo_in > hi_out:
            print(f"suggested SIM_FLOOR ≈ {(lo_in + hi_out) / 2:.3f}")
        else:
            print("WARNING: distributions overlap — no clean floor; consider hybrid weighting.")


if __name__ == "__main__":
    main()
