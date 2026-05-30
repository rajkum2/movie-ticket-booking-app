"""Multi-turn movie chat, powered by DeepSeek.

The frontend keeps the conversation in component state and posts the full
history on every turn. We prepend a movie-focused system prompt and stream
the assistant's reply back to the client.
"""
from __future__ import annotations

from typing import Iterator, List, Literal

from pydantic import BaseModel, Field

from summariser import DEEPSEEK_MODEL, get_deepseek_client


SYSTEM_PROMPT = (
    "You are CineBot, a friendly movie-savvy assistant for the CineBook ticket "
    "booking app. Help users discover, discuss, and decide on films. You can: "
    "recommend movies by mood/genre/era, summarise plots without third-act "
    "spoilers, compare films, explain themes, suggest watch orders, and answer "
    "trivia. Politely redirect off-topic questions back to cinema. Keep replies "
    "concise (under ~200 words) unless the user asks for depth."
)


ChatRole = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    role: ChatRole
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=40)


def stream_chat(messages: List[ChatMessage]) -> Iterator[str]:
    client = get_deepseek_client()
    payload = [{"role": "system", "content": SYSTEM_PROMPT}] + [
        {"role": m.role, "content": m.content} for m in messages
    ]
    response = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=payload,
        stream=True,
        temperature=0.6,
    )
    for event in response:
        if not event.choices:
            continue
        delta = event.choices[0].delta.content
        if delta:
            yield delta
