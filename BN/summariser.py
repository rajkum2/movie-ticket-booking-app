"""DeepSeek-powered movie summariser.

DeepSeek's API is OpenAI-compatible, so we use the langfuse-wrapped OpenAI
SDK pointed at their base URL. Importing OpenAI from `langfuse.openai`
auto-traces every completion when Langfuse is configured; otherwise it
behaves identically to the stock client.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Iterator

from observability import get_prompt


# Importing from langfuse.openai gives us the same OpenAI class with
# automatic tracing. Falls back to the stock client when Langfuse keys
# are unset — the wrapper handles that case internally.
try:
    from langfuse.openai import OpenAI  # type: ignore
except Exception:  # pragma: no cover — defensive fallback
    from openai import OpenAI  # type: ignore


DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = "deepseek-chat"


@lru_cache
def get_deepseek_client() -> OpenAI:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")
    return OpenAI(api_key=key, base_url=DEEPSEEK_BASE_URL)


def stream_summary(title: str) -> Iterator[str]:
    """Yield content deltas for a streaming chat completion."""
    client = get_deepseek_client()
    system_text, prompt_obj = get_prompt("summariser-system")
    kwargs = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_text},
            {"role": "user", "content": f"Summarise the movie: {title}"},
        ],
        "stream": True,
    }
    if prompt_obj is not None:
        kwargs["langfuse_prompt"] = prompt_obj
    response = client.chat.completions.create(**kwargs)
    for event in response:
        if not event.choices:
            continue
        delta = event.choices[0].delta.content
        if delta:
            yield delta
