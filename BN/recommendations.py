"""Personalized recommendations.

Deterministic (no LLM) scoring that blends two signals:
  * booking history — genres/languages the user has actually booked
  * agent memory   — durable preferences saved via the `memory` capability

Falls back to top-rated "popular" movies when there's no signal yet, and is
resilient if the memory table doesn't exist (e.g. before the migration runs).
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import List

import memory

log = logging.getLogger("uvicorn.error")


def _safe_memory_text(user_id: int, sb) -> str:
    try:
        rows = memory.list_memories(user_id, sb)
    except Exception as exc:  # table missing / not enabled — degrade gracefully
        log.debug("memory unavailable for recommendations: %s", exc)
        return ""
    return " ".join((r.get("content") or "") for r in rows).lower()


def recommend(user: dict, sb, limit: int = 8) -> dict:
    movies = sb.table("movies").select("*").order("id").execute().data or []
    if not movies:
        return {"basis": "popular", "reason": "Popular now", "movies": []}

    bookings = (
        sb.table("bookings").select("movie_id").eq("user_id", user["id"]).execute().data
        or []
    )
    booked_ids = {b["movie_id"] for b in bookings}
    booked_movies = [m for m in movies if m["id"] in booked_ids]

    genre_pref = Counter(m.get("genre") for m in booked_movies if m.get("genre"))
    lang_pref = Counter(m.get("language") for m in booked_movies if m.get("language"))
    mem_text = _safe_memory_text(user["id"], sb)

    # Decide what we're basing recs on (for the UI label).
    if booked_movies:
        basis = "history"
        top_genre = genre_pref.most_common(1)[0][0] if genre_pref else None
        reason = f"Because you booked {top_genre} films" if top_genre else "Based on your bookings"
    elif mem_text.strip():
        basis = "memory"
        reason = "Based on what you've told CineBot"
    else:
        basis = "popular"
        reason = "Popular now"

    def score(m: dict) -> float:
        s = 0.0
        g = (m.get("genre") or "")
        l = (m.get("language") or "")
        s += genre_pref.get(g, 0) * 2.0
        s += lang_pref.get(l, 0) * 1.0
        if g and g.lower() in mem_text:
            s += 3.0
        if l and l.lower() in mem_text:
            s += 1.5
        s += float(m.get("rating") or 0) * 0.1
        return s

    candidates = [m for m in movies if m["id"] not in booked_ids] or movies

    if basis == "popular":
        ranked = sorted(candidates, key=lambda m: float(m.get("rating") or 0), reverse=True)
    else:
        ranked = sorted(candidates, key=score, reverse=True)

    return {"basis": basis, "reason": reason, "movies": ranked[:limit]}
