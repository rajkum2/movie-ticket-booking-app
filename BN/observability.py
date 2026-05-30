"""Langfuse integration: tracing + prompt management + scoring.

What this module gives us:

1. **Tracing** — `langfuse.openai.OpenAI` (imported in each feature module)
   auto-captures every DeepSeek call: full prompt, response, tokens, cost,
   latency. Each endpoint pre-generates a `trace_id` so the frontend can
   reference it later to attach thumbs feedback.

2. **Prompt management** — system prompts live in Langfuse, fetched at
   runtime via `get_prompt_text(name)`. If Langfuse is unreachable or the
   prompt has not been seeded yet, we fall back to the hardcoded default
   in `DEFAULT_PROMPTS` so the app never breaks. `seed_prompts()` runs on
   startup and creates any missing prompts.

3. **Scoring** — `record_score(trace_id, value)` posts user thumbs to
   Langfuse, linked to the trace that produced the response.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Optional, Tuple

log = logging.getLogger("uvicorn.error")


# ---------------------------------------------------------------------------
# Default prompt text — used to seed Langfuse on first run AND as fallback
# when Langfuse is unavailable. Keep these in sync with the desired baseline
# behaviour of each feature.
# ---------------------------------------------------------------------------
DEFAULT_PROMPTS: dict[str, str] = {
    "summariser-system": (
        "You are a knowledgeable film critic. Given a movie title, write a "
        "vivid, engaging summary of about 180-220 words covering the premise, "
        "themes, tone, notable performances or direction, and critical "
        "reception. Avoid spoilers from the third act. If you do not "
        "recognise the title, say so in one sentence rather than inventing a "
        "plot."
    ),
    "chat-system": (
        "You are CineBot, a friendly movie-savvy assistant for the CineBook "
        "ticket booking app. Help users discover, discuss, and decide on "
        "films. You can recommend movies by mood/genre/era, summarise plots "
        "without third-act spoilers, compare films, explain themes, suggest "
        "watch orders, and answer trivia. Politely redirect off-topic "
        "questions back to cinema. Keep replies concise (under ~200 words) "
        "unless the user asks for depth."
    ),
    "search-parser-system": (
        "You convert a user's natural-language movie search query into JSON "
        "filters.\n\n"
        "Output JSON only — no prose, no markdown fences. Use exactly this "
        "schema, omitting any key the user did not mention:\n\n"
        "{\n"
        '  "title_contains": string,\n'
        '  "genres": [string, ...],\n'
        '  "languages": [string, ...],\n'
        '  "min_rating": number between 0 and 10\n'
        "}\n\n"
        "Guidelines:\n"
        "- Genres use title case: Action, Comedy, Drama, Sci-Fi, Animation, "
        "Thriller, Horror, Romance, Adventure, Mystery, Fantasy. Map "
        "synonyms (\"sci-fi\"/\"scifi\"/\"science fiction\" -> \"Sci-Fi\", "
        "\"rom-com\" -> [\"Romance\", \"Comedy\"]).\n"
        "- Languages use title case: English, Japanese, Hindi, Telugu, "
        "Tamil, Korean, French, Spanish, Mandarin.\n"
        "- \"good\" / \"highly rated\" -> min_rating 8. \"great\" -> 8.5. "
        "Numeric phrases (\"rated above 7\", \"8+ stars\") -> that number.\n"
        "- A specific phrase that does not fit other fields (a movie title, "
        "an actor name) goes in title_contains.\n"
        "- If you cannot parse anything useful, return {}.\n\n"
        "Examples:\n"
        '"action movies" -> {"genres": ["Action"]}\n'
        '"highly rated japanese films" -> {"languages": ["Japanese"], '
        '"min_rating": 8}\n'
        '"the dark knight" -> {"title_contains": "dark knight"}\n'
        '"hindi or telugu thrillers above 7" -> {"languages": ["Hindi", '
        '"Telugu"], "genres": ["Thriller"], "min_rating": 7}\n'
        '"good movies" -> {"min_rating": 8}\n'
        '"" -> {}'
    ),
    "rag-grounding-preamble": (
        "You are CineBot, a friendly movie-savvy assistant. The user has "
        "enabled knowledge-base grounding. Use the CONTEXT below as your "
        "primary source. When you state a fact that comes from a context "
        "entry, cite the document title in square brackets like [Title]. If "
        "the context does not contain the answer, you may use general "
        "knowledge but explicitly say \"this isn't from the knowledge base\" "
        "so the user knows. Keep replies concise unless the user asks for "
        "depth."
    ),
    "rag-query-reformulator": (
        "You rewrite a user's latest chat message into a single self-contained "
        "search query, resolving any pronouns or references using the chat "
        "history.\n\n"
        "Output ONLY the rewritten question — no quotes, no prefix, no "
        "explanation.\n\n"
        "Rules:\n"
        "- If the latest message is already self-contained (mentions the "
        "subject explicitly), return it unchanged.\n"
        "- If it uses pronouns or implicit references (\"it\", \"its\", "
        "\"that one\", \"what about the runtime?\"), substitute the actual "
        "subject from the most recent topic in the history.\n"
        "- For comparisons (\"which is shorter?\"), explicitly name the "
        "subjects being compared.\n"
        "- If the message is pure chitchat (\"thanks\", \"ok\", \"cool\") "
        "with nothing to search for, return an empty string.\n"
        "- Keep the rewritten query concise — under 30 words."
    ),
}


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------
@lru_cache
def get_langfuse():
    """Return a configured Langfuse client, or None if not configured.

    Returning None makes every feature degrade gracefully when Langfuse
    is unset — useful for local dev without forcing every contributor to
    sign up.
    """
    pk = os.environ.get("LANGFUSE_PUBLIC_KEY")
    sk = os.environ.get("LANGFUSE_SECRET_KEY")
    host = os.environ.get("LANGFUSE_HOST", "https://us.cloud.langfuse.com")
    if not (pk and sk):
        log.info("Langfuse not configured (LANGFUSE_PUBLIC_KEY/SECRET_KEY) — tracing disabled")
        return None
    try:
        from langfuse import Langfuse  # type: ignore

        return Langfuse(public_key=pk, secret_key=sk, host=host)
    except Exception as exc:
        log.warning("Could not initialise Langfuse: %s", exc)
        return None


def langfuse_enabled() -> bool:
    return get_langfuse() is not None


# ---------------------------------------------------------------------------
# Prompt management
# ---------------------------------------------------------------------------
def seed_prompts() -> None:
    """Create any missing prompts in Langfuse using the defaults."""
    lf = get_langfuse()
    if lf is None:
        return
    for name, default in DEFAULT_PROMPTS.items():
        try:
            lf.get_prompt(name, label="production")
        except Exception:
            try:
                lf.create_prompt(
                    name=name,
                    prompt=default,
                    labels=["production"],
                )
                log.info("Seeded Langfuse prompt '%s'", name)
            except Exception as exc:
                log.warning("Could not seed prompt '%s': %s", name, exc)


def get_prompt(name: str) -> Tuple[str, Optional[object]]:
    """Fetch the production prompt text from Langfuse.

    Returns (text, prompt_object_or_None). Pass the second value as
    `langfuse_prompt=...` to the OpenAI wrapper so the trace is linked
    to the exact prompt version used.
    """
    lf = get_langfuse()
    if lf is None:
        return DEFAULT_PROMPTS.get(name, ""), None
    try:
        prompt = lf.get_prompt(name, label="production")
        return prompt.prompt, prompt
    except Exception as exc:
        log.warning("Could not fetch Langfuse prompt '%s': %s — using default", name, exc)
        return DEFAULT_PROMPTS.get(name, ""), None


# ---------------------------------------------------------------------------
# Tracing helpers
# ---------------------------------------------------------------------------
def new_trace_id() -> str:
    """Generate an OTel-compatible 32-char hex trace ID."""
    lf = get_langfuse()
    if lf is not None:
        try:
            # Langfuse v3 ships a helper that creates a deterministic OTel ID
            return lf.create_trace_id()  # type: ignore[attr-defined]
        except Exception:
            pass
    import secrets

    return secrets.token_hex(16)


# ---------------------------------------------------------------------------
# Scoring (thumbs feedback)
# ---------------------------------------------------------------------------
def record_score(trace_id: str, value: int, comment: Optional[str] = None) -> bool:
    """Attach a thumbs score (0 or 1) to a trace. Returns success."""
    lf = get_langfuse()
    if lf is None:
        return False
    try:
        lf.create_score(
            trace_id=trace_id,
            name="user-feedback",
            value=float(value),
            data_type="NUMERIC",
            comment=comment,
        )
        return True
    except Exception as exc:
        log.warning("Could not record score on trace %s: %s", trace_id, exc)
        return False


def flush() -> None:
    lf = get_langfuse()
    if lf is not None:
        try:
            lf.flush()
        except Exception as exc:
            log.warning("Langfuse flush failed: %s", exc)


# ---------------------------------------------------------------------------
# Context manager for tracing a streaming generator
# ---------------------------------------------------------------------------
class TraceContext:
    """Wraps a streaming generator in a Langfuse span with a known trace_id.

    Usage:
        ctx = TraceContext(name="chat", user_id="42", tags=["chat"])
        def gen():
            with ctx:
                for chunk in stream_chat(messages):
                    yield chunk
        return StreamingResponse(gen(), headers={"X-Trace-Id": ctx.trace_id})

    When Langfuse is unconfigured the context is a no-op but still returns
    a randomly-generated trace_id so the frontend code can stay uniform.
    """

    def __init__(
        self,
        name: str,
        user_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ):
        self.name = name
        self.user_id = user_id
        self.tags = tags or []
        self.metadata = metadata or {}
        self.trace_id = new_trace_id()
        self._span_cm = None

    def __enter__(self):
        lf = get_langfuse()
        if lf is None:
            return self
        try:
            self._span_cm = lf.start_as_current_span(
                name=self.name,
                trace_context={"trace_id": self.trace_id},
            )
            span = self._span_cm.__enter__()
            try:
                span.update_trace(
                    user_id=self.user_id,
                    tags=self.tags,
                    metadata=self.metadata or None,
                )
            except Exception as exc:
                log.debug("update_trace failed: %s", exc)
        except Exception as exc:
            log.warning("Could not start Langfuse span '%s': %s", self.name, exc)
            self._span_cm = None
        return self

    def __exit__(self, exc_type, exc, tb):
        if self._span_cm is not None:
            try:
                self._span_cm.__exit__(exc_type, exc, tb)
            except Exception as exc2:
                log.debug("Span exit failed: %s", exc2)
        return False
