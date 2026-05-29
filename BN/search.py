"""Natural-language search-query parser, powered by DeepSeek.

The frontend captures a free-text query (typed or spoken via Web Speech API)
and POSTs it here. We ask DeepSeek for a JSON object whose keys map 1:1 to
the visible filter state in `FN/src/pages/Movies.jsx`.
"""
from __future__ import annotations

import json
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from summariser import DEEPSEEK_MODEL, get_deepseek_client


SYSTEM_PROMPT = """You convert a user's natural-language movie search query into JSON filters.

Output JSON only — no prose, no markdown fences. Use exactly this schema, omitting any key the user did not mention:

{
  "title_contains": string,
  "genres": [string, ...],
  "languages": [string, ...],
  "min_rating": number between 0 and 10
}

Guidelines:
- Genres use title case: Action, Comedy, Drama, Sci-Fi, Animation, Thriller, Horror, Romance, Adventure, Mystery, Fantasy. Map synonyms ("sci-fi"/"scifi"/"science fiction" -> "Sci-Fi", "rom-com" -> ["Romance", "Comedy"]).
- Languages use title case: English, Japanese, Hindi, Telugu, Tamil, Korean, French, Spanish, Mandarin.
- "good" / "highly rated" -> min_rating 8. "great" -> 8.5. Numeric phrases ("rated above 7", "8+ stars") -> that number.
- A specific phrase that does not fit other fields (a movie title, an actor name) goes in title_contains.
- If you cannot parse anything useful, return {}.

Examples:
"action movies" -> {"genres": ["Action"]}
"highly rated japanese films" -> {"languages": ["Japanese"], "min_rating": 8}
"the dark knight" -> {"title_contains": "dark knight"}
"hindi or telugu thrillers above 7" -> {"languages": ["Hindi", "Telugu"], "genres": ["Thriller"], "min_rating": 7}
"good movies" -> {"min_rating": 8}
"" -> {}
"""


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
    completion = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query.strip()},
        ],
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=200,
    )
    raw = completion.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    return SearchFilters.model_validate(data)
