"""Agentic chat: DeepSeek tool-calling over read-only, in-process tools.

This backs the `tools` capability (gated by the `feature_flags.tools` flag).
When enabled, `/chat/agent` runs a ReAct loop: the model may call any of the
read-only tools below — each backed by the same Supabase queries the REST
endpoints use — we feed the results back, and repeat until it produces a final
answer or we hit `MAX_ITERATIONS`.

Safety properties worth keeping intact when you extend this:
  * Every tool is READ-ONLY. No writes, no bookings, no deletes.
  * `get_my_bookings` derives the user from the auth context passed into
    `stream_agent_chat`, NEVER from tool arguments — so the model cannot read
    another user's data by passing a different id.
  * A hard `MAX_ITERATIONS` cap prevents runaway tool loops.

The generator yields plain dicts; the endpoint serialises them as NDJSON:
  {"type": "tool_call",   "name", "args"}      # agent decided to call a tool
  {"type": "tool_result", "name", "summary"}   # short human-readable outcome
  {"type": "delta",       "content"}           # a piece of the final answer
  {"type": "done"}
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Iterator, List

from database import get_supabase
from observability import get_prompt
from summariser import DEEPSEEK_MODEL, get_deepseek_client

import featureflags
import memory
import rag

log = logging.getLogger("uvicorn.error")

MAX_ITERATIONS = 5


# ---------------------------------------------------------------------------
# Tool schemas advertised to the model (OpenAI function-calling spec).
# ---------------------------------------------------------------------------
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_movies",
            "description": (
                "Search the movie catalog. All filters are optional and "
                "combined with AND. Returns a list of matching movies with "
                "their id, title, genre, language, rating, runtime and price."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Free text matched against the title.",
                    },
                    "genre": {
                        "type": "string",
                        "description": "Genre, e.g. Action, Drama, Sci-Fi.",
                    },
                    "language": {
                        "type": "string",
                        "description": "Language, e.g. English, Telugu, Hindi.",
                    },
                    "min_rating": {
                        "type": "number",
                        "description": "Minimum rating from 0 to 10.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_movie_details",
            "description": "Full details for one movie by its id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "movie_id": {"type": "integer", "description": "The movie id."}
                },
                "required": ["movie_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_showtimes",
            "description": "The list of showtimes for one movie by its id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "movie_id": {"type": "integer", "description": "The movie id."}
                },
                "required": ["movie_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_seat_availability",
            "description": (
                "Which seats are already booked for a given movie + showtime. "
                "Use the exact showtime string from get_showtimes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "movie_id": {"type": "integer", "description": "The movie id."},
                    "showtime": {
                        "type": "string",
                        "description": "Showtime string, e.g. '06:00 PM'.",
                    },
                },
                "required": ["movie_id", "showtime"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_bookings",
            "description": (
                "The signed-in user's own bookings (movie, showtime, seats, "
                "amount). Takes no arguments — the user is known from the "
                "session."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "current_datetime",
            "description": (
                "The current server date and time. Use to resolve relative "
                "phrases like 'tonight', 'this weekend', 'tomorrow'."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_help_docs",
            "description": (
                "Search CineBook's help & policy knowledge base (refunds, "
                "cancellations, FAQ, accessibility, food & beverage, payment) "
                "for answers about how the cinema works. Use this for policy or "
                "how-to questions instead of guessing, and cite the doc title."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to look up, e.g. 'refund for late cancellation'.",
                    }
                },
                "required": ["query"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Tool implementations — read-only, user-scoped where relevant.
# Each returns (result_obj_for_model, short_summary_for_ui).
# ---------------------------------------------------------------------------
def _slim_movie(m: dict) -> dict:
    return {
        "id": m.get("id"),
        "title": m.get("title"),
        "genre": m.get("genre"),
        "language": m.get("language"),
        "rating": m.get("rating"),
        "duration_minutes": m.get("duration_minutes"),
        "price": m.get("price"),
        "showtimes": m.get("showtimes") or [],
    }


def _tool_search_movies(args: dict, user: dict, sb) -> tuple:
    rows = sb.table("movies").select("*").order("id").execute().data or []
    query = (args.get("query") or "").strip().lower()
    genre = (args.get("genre") or "").strip().lower()
    language = (args.get("language") or "").strip().lower()
    min_rating = args.get("min_rating")

    def keep(m: dict) -> bool:
        if query and query not in (m.get("title") or "").lower():
            return False
        if genre and genre != (m.get("genre") or "").lower():
            return False
        if language and language != (m.get("language") or "").lower():
            return False
        if min_rating is not None and (m.get("rating") or 0) < float(min_rating):
            return False
        return True

    matched = [_slim_movie(m) for m in rows if keep(m)][:25]
    return {"count": len(matched), "movies": matched}, f"found {len(matched)} movie(s)"


def _tool_get_movie_details(args: dict, user: dict, sb) -> tuple:
    movie_id = args.get("movie_id")
    res = sb.table("movies").select("*").eq("id", movie_id).execute()
    if not res.data:
        return {"error": "Movie not found"}, "not found"
    m = res.data[0]
    return m, f"loaded '{m.get('title')}'"


def _tool_get_showtimes(args: dict, user: dict, sb) -> tuple:
    movie_id = args.get("movie_id")
    res = sb.table("movies").select("id,title,showtimes").eq("id", movie_id).execute()
    if not res.data:
        return {"error": "Movie not found"}, "not found"
    m = res.data[0]
    times = m.get("showtimes") or []
    return {
        "movie_id": m["id"],
        "title": m.get("title"),
        "showtimes": times,
    }, f"{len(times)} showtime(s)"


def _tool_get_seat_availability(args: dict, user: dict, sb) -> tuple:
    movie_id = args.get("movie_id")
    showtime = args.get("showtime")
    res = (
        sb.table("bookings")
        .select("seats")
        .eq("movie_id", movie_id)
        .eq("showtime", showtime)
        .execute()
    )
    booked: List[str] = []
    for row in res.data or []:
        booked.extend(row.get("seats") or [])
    booked = sorted(set(booked))
    return {
        "movie_id": movie_id,
        "showtime": showtime,
        "booked_seats": booked,
    }, f"{len(booked)} seat(s) taken"


def _tool_get_my_bookings(args: dict, user: dict, sb) -> tuple:
    # user comes from the auth context, never from args — no cross-user reads.
    res = (
        sb.table("bookings")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    bookings = res.data or []
    movie_ids = list({b["movie_id"] for b in bookings})
    titles: dict = {}
    if movie_ids:
        m_res = sb.table("movies").select("id,title").in_("id", movie_ids).execute()
        titles = {m["id"]: m["title"] for m in (m_res.data or [])}
    slim = [
        {
            "id": b.get("id"),
            "movie_title": titles.get(b["movie_id"]),
            "showtime": b.get("showtime"),
            "seats": b.get("seats"),
            "total_amount": b.get("total_amount"),
            "created_at": b.get("created_at"),
        }
        for b in bookings
    ]
    return {"count": len(slim), "bookings": slim}, f"{len(slim)} booking(s)"


def _tool_current_datetime(args: dict, user: dict, sb) -> tuple:
    now = datetime.now(timezone.utc).astimezone()
    return {
        "iso": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%I:%M %p"),
        "weekday": now.strftime("%A"),
    }, now.strftime("%a %d %b, %I:%M %p")


def _tool_search_help_docs(args: dict, user: dict, sb) -> tuple:
    query = (args.get("query") or "").strip()
    if not query:
        return {"results": []}, "no query"
    try:
        chunks = rag.retrieve(query, k=4)
    except Exception as exc:  # noqa: BLE001 — surface to model, don't crash
        log.warning("search_help_docs failed: %s", exc)
        return {"error": str(exc), "results": []}, "help search unavailable"
    results = [
        {"title": c.get("document_title"), "snippet": (c.get("content") or "")[:300]}
        for c in chunks
    ]
    return {"count": len(results), "results": results}, f"found {len(results)} help snippet(s)"


DISPATCH = {
    "search_movies": _tool_search_movies,
    "get_movie_details": _tool_get_movie_details,
    "get_showtimes": _tool_get_showtimes,
    "get_seat_availability": _tool_get_seat_availability,
    "get_my_bookings": _tool_get_my_bookings,
    "current_datetime": _tool_current_datetime,
    "search_help_docs": _tool_search_help_docs,
}


# ---------------------------------------------------------------------------
# ReAct loop
# ---------------------------------------------------------------------------
def stream_agent_chat(messages, user: dict) -> Iterator[dict]:
    """Run the tool-calling loop and yield NDJSON-ready event dicts."""
    client = get_deepseek_client()
    sb = get_supabase()
    system_text, prompt_obj = get_prompt("agent-system")

    # Memory is an optional capability (the `memory` flag) — when on, the agent
    # gets recall_memory/remember tools and a prompt nudge to use them.
    use_memory = featureflags.is_enabled("memory")
    tools = TOOLS + (memory.MEMORY_TOOLS if use_memory else [])
    dispatch = {**DISPATCH, **(memory.MEMORY_DISPATCH if use_memory else {})}
    if use_memory:
        system_text = system_text + memory.MEMORY_PROMPT_SNIPPET

    convo = [{"role": "system", "content": system_text}] + [
        {"role": m.role, "content": m.content} for m in messages
    ]

    for _ in range(MAX_ITERATIONS):
        kwargs = {
            "model": DEEPSEEK_MODEL,
            "messages": convo,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.4,
        }
        if prompt_obj is not None:
            kwargs["langfuse_prompt"] = prompt_obj
        resp = client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message
        tool_calls = msg.tool_calls or []

        if not tool_calls:
            # Final answer — stream it out (already complete, send as one delta).
            if msg.content:
                yield {"type": "delta", "content": msg.content}
            return

        # Record the assistant's tool-call turn in the conversation.
        convo.append(
            {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in tool_calls
                ],
            }
        )

        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            yield {"type": "tool_call", "name": name, "args": args}

            fn = dispatch.get(name)
            if fn is None:
                result, summary = {"error": f"Unknown tool: {name}"}, "unknown tool"
            else:
                try:
                    result, summary = fn(args, user, sb)
                except Exception as exc:  # surface to model so it can recover
                    log.exception("Tool '%s' failed", name)
                    result, summary = {"error": str(exc)}, f"error: {exc}"

            yield {"type": "tool_result", "name": name, "summary": summary}
            convo.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, default=str),
                }
            )

    # Hit the iteration cap without a final answer.
    yield {
        "type": "delta",
        "content": (
            "\n\n[Stopped after several tool calls without reaching an answer. "
            "Try rephrasing your question.]"
        ),
    }
