"""DeepSeek-powered movie summariser.

DeepSeek's API is OpenAI-compatible, so we use the `openai` SDK pointed at
their base URL. We ask the model to summarise from its own knowledge of the
film (by title), and stream the response as it arrives.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Iterator

from openai import OpenAI


DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = "deepseek-chat"

SYSTEM_PROMPT = (
    "You are a knowledgeable film critic. Given a movie title, write a vivid, "
    "engaging summary of about 180-220 words covering the premise, themes, "
    "tone, notable performances or direction, and critical reception. Avoid "
    "spoilers from the third act. If you do not recognise the title, say so "
    "in one sentence rather than inventing a plot."
)


@lru_cache
def get_deepseek_client() -> OpenAI:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")
    return OpenAI(api_key=key, base_url=DEEPSEEK_BASE_URL)


def stream_summary(title: str) -> Iterator[str]:
    """Yield content deltas for a streaming chat completion."""
    client = get_deepseek_client()
    response = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Summarise the movie: {title}"},
        ],
        stream=True,
    )
    for event in response:
        if not event.choices:
            continue
        delta = event.choices[0].delta.content
        if delta:
            yield delta
