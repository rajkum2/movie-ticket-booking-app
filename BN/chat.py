"""Multi-turn movie chat, powered by DeepSeek.

The frontend keeps the conversation in component state and posts the full
history on every turn. We prepend a movie-focused system prompt (fetched
from Langfuse) and stream the assistant's reply back to the client.
"""
from __future__ import annotations

from typing import Iterator, List, Literal, Optional

from pydantic import BaseModel, Field

from observability import get_prompt
from summariser import DEEPSEEK_MODEL, get_deepseek_client


ChatRole = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    role: ChatRole
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=40)


def stream_completion(
    messages: List[dict],
    temperature: float = 0.6,
    langfuse_prompt: Optional[object] = None,
) -> Iterator[str]:
    """Lower-level helper used by both plain chat and RAG chat. Takes raw
    `{role, content}` dicts so callers can prepend their own system prompt."""
    client = get_deepseek_client()
    kwargs = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
    }
    if langfuse_prompt is not None:
        kwargs["langfuse_prompt"] = langfuse_prompt
    response = client.chat.completions.create(**kwargs)
    for event in response:
        if not event.choices:
            continue
        delta = event.choices[0].delta.content
        if delta:
            yield delta


def stream_chat(messages: List[ChatMessage]) -> Iterator[str]:
    system_text, prompt_obj = get_prompt("chat-system")
    payload = [{"role": "system", "content": system_text}] + [
        {"role": m.role, "content": m.content} for m in messages
    ]
    yield from stream_completion(payload, langfuse_prompt=prompt_obj)
