"""Streaming answer generation via ``google-genai``.

Uses ``GENERATION_MODEL`` and falls back to ``GENERATION_FALLBACK_MODEL`` on a
rate-limit error *before any output has streamed* (D6). Prompts come only from
``prompts.py``; tuning only from ``config.py``. Yields plain text deltas.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence

import config
import prompts
from errors import AppError
from models import ChatTurn


def _is_rate_limited(err: Exception) -> bool:
    code = getattr(err, "code", None)
    status = str(getattr(err, "status", "") or "")
    return code in (429, 503) or "RESOURCE_EXHAUSTED" in status


def _build_contents(history: Sequence[ChatTurn], user_prompt: str) -> list:
    """Turn chat history + the final user prompt into ``google-genai`` contents.

    Chat history (D13) is sent to *generation only*. Roles map assistant->model.
    Leading assistant turns are dropped so the sequence starts with a user turn.
    """
    from google.genai import types

    # A "turn" is a user+assistant exchange, so keep the last N*2 messages (D13).
    turns = list(history)[-(config.MAX_HISTORY_TURNS * 2) :]
    while turns and turns[0].role != "user":
        turns.pop(0)

    contents: list = []
    for turn in turns:
        role = "model" if turn.role == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=turn.content)]))
    contents.append(types.Content(role="user", parts=[types.Part(text=user_prompt)]))
    return contents


def stream_answer(
    question: str,
    context_block: str,
    history: Sequence[ChatTurn],
) -> Iterator[str]:
    """Stream the grounded answer as text deltas.

    Falls back to the lite model only if the primary model rate-limits before
    emitting any text (falling back mid-stream would duplicate output).
    """
    from genai_client import get_genai_client
    from google.genai import errors as genai_errors
    from google.genai import types

    client = get_genai_client()
    contents = _build_contents(history, prompts.build_user_prompt(question, context_block))
    cfg_kwargs: dict = {
        "system_instruction": prompts.SYSTEM_PROMPT,
        "temperature": config.GENERATION_TEMPERATURE,
        "max_output_tokens": config.GENERATION_MAX_OUTPUT_TOKENS,
    }
    try:
        # Disable silent "thinking" (seconds of first-token latency a grounded
        # RAG answer doesn't need). Guarded broadly: this SDK version's
        # ThinkingConfig may not expose thinking_budget (pydantic raises
        # ValidationError) — degrade to default behaviour, and pick the
        # override up automatically on an SDK upgrade.
        cfg_kwargs["thinking_config"] = types.ThinkingConfig(
            thinking_budget=config.GENERATION_THINKING_BUDGET
        )
    except Exception:  # noqa: BLE001 - optional optimisation, never fatal
        pass
    cfg = types.GenerateContentConfig(**cfg_kwargs)

    models = [config.GENERATION_MODEL, config.GENERATION_FALLBACK_MODEL]
    last_err: Exception | None = None
    for index, model in enumerate(models):
        started = False
        try:
            # SDK surface live-verified (see docs/decisions.md, live bring-up:
            # streamed asks measured 3.3-4.5s end-to-end).
            stream = client.models.generate_content_stream(
                model=model,
                contents=contents,
                config=cfg,
            )
            for chunk in stream:
                text = getattr(chunk, "text", None)
                if text:
                    started = True
                    yield text
            return
        except genai_errors.APIError as err:
            last_err = err
            # If the model rejects the request config — a generic 400
            # INVALID_ARGUMENT is how some models refuse thinking_budget=0 —
            # strip the thinking override and retry this model once rather
            # than failing the whole answer.
            err_text = str(err).lower()
            config_rejected = (
                "thinking" in err_text
                or "invalid argument" in err_text
                or "invalid_argument" in err_text
                or getattr(err, "code", None) == 400
            )
            if (
                not started
                and config_rejected
                and "thinking_config" in cfg_kwargs
            ):
                cfg_kwargs.pop("thinking_config")
                cfg = types.GenerateContentConfig(**cfg_kwargs)
                try:
                    stream = client.models.generate_content_stream(
                        model=model, contents=contents, config=cfg
                    )
                    for chunk in stream:
                        text = getattr(chunk, "text", None)
                        if text:
                            yield text
                    return
                except genai_errors.APIError as retry_err:
                    last_err = retry_err
                    err = retry_err
            can_fall_back = (
                _is_rate_limited(err) and not started and index < len(models) - 1
            )
            if can_fall_back:
                continue
            raise AppError(
                "generation_failed",
                f"Answer generation failed: {err.message}",
                502,
            ) from err
    raise AppError(
        "generation_failed",
        "Answer generation exhausted model fallbacks.",
        502,
    ) from last_err
