"""Natural-language search-query parser, powered by DeepSeek.

The frontend captures a free-text query (typed or spoken via Web Speech API)
and POSTs it here. We ask DeepSeek for a JSON object whose keys map 1:1 to
the visible filter state in `FN/src/pages/Movies.jsx`.
"""
from __future__ import annotations

import json
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from observability import get_prompt
from summariser import DEEPSEEK_MODEL, get_deepseek_client


class SearchFilters(BaseModel):
    title_contains: Optional[str] = None
    genres: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    min_rating: Optional[float] = Field(default=None, ge=0, le=10)

    @field_validator("genres", "languages", mode="before")
    @classmethod
    def _drop_empty_lists(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            cleaned = [str(x).strip() for x in v if str(x).strip()]
            return cleaned or None
        return v

    @field_validator("title_contains", mode="before")
    @classmethod
    def _strip_title(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return s or None


class SearchQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=300)


def parse_query(query: str) -> SearchFilters:
    client = get_deepseek_client()
    system_text, prompt_obj = get_prompt("search-parser-system")
    kwargs = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_text},
            {"role": "user", "content": query.strip()},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
        "max_tokens": 200,
    }
    if prompt_obj is not None:
        kwargs["langfuse_prompt"] = prompt_obj
    completion = client.chat.completions.create(**kwargs)
    raw = completion.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    return SearchFilters.model_validate(data)
