"""Layer 3b — action-taking agent (propose/execute).

Extends the read-only agent (`agent.py`) with two **proposal** tools. The model
runs the same ReAct loop with all the read tools, and when it has gathered
enough to perform a write it calls `propose_booking` / `propose_cancellation`.
Those tools DO NOT write — they validate and return a proposal. The loop then
emits a `confirm_request` event and stops. The actual write happens only when
the user clicks Confirm and the frontend calls `/chat/agent/execute`, which runs
the deterministic `execute_*` functions in `bookings_service.py`.

This keeps a human and plain server code between the model and the database —
the model can never directly cause a state change.

NDJSON events: tool_call / tool_result / confirm_request / delta / done.
"""
from __future__ import annotations

import json
import logging
from typing import Iterator, List

from fastapi import HTTPException

from agent import DISPATCH as READ_DISPATCH, TOOLS as READ_TOOLS, MAX_ITERATIONS
from bookings_service import validate_and_price_booking
from database import get_supabase
from observability import get_prompt
from summariser import DEEPSEEK_MODEL, get_deepseek_client

log = logging.getLogger("uvicorn.error")


# ---------------------------------------------------------------------------
# Proposal tool schemas (advertised to the model alongside the read tools).
# ---------------------------------------------------------------------------
PROPOSE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "propose_booking",
            "description": (
                "Propose a booking for the user to confirm. Call this ONLY once "
                "you know the exact movie id, an exact showtime string (from "
                "get_showtimes), and the specific seats. This does NOT book "
                "anything — it asks the user to confirm. Never tell the user a "
                "booking is done until after they confirm."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "movie_id": {"type": "integer", "description": "The movie id."},
                    "showtime": {
                        "type": "string",
                        "description": "Exact showtime string, e.g. '09:00 PM'.",
                    },
                    "seats": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Seat labels, e.g. ['A1','A2'].",
                    },
                },
                "required": ["movie_id", "showtime", "seats"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_cancellation",
            "description": (
                "Propose cancelling one of the user's own bookings for them to "
                "confirm. Use get_my_bookings first to find the booking id. This "
                "does NOT cancel anything — it asks the user to confirm."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "booking_id": {
                        "type": "integer",
                        "description": "The booking id to cancel.",
                    }
                },
                "required": ["booking_id"],
            },
        },
    },
]

ALL_TOOLS = READ_TOOLS + PROPOSE_TOOLS


# ---------------------------------------------------------------------------
# Proposal handlers — validate only, return a proposal dict. No writes.
# Each returns {"ok": True, "action", "args", "summary"} or {"ok": False, "error"}.
# ---------------------------------------------------------------------------
def _propose_booking(args: dict, user: dict, sb) -> dict:
    movie_id = args.get("movie_id")
    showtime = args.get("showtime")
    seats = args.get("seats") or []
    try:
        movie, total = validate_and_price_booking(sb, movie_id, showtime, seats)
    except HTTPException as exc:
        return {"ok": False, "error": str(exc.detail)}
    summary = (
        f"Book {len(seats)} seat(s) ({', '.join(seats)}) for "
        f"{movie['title']} at {showtime} — total ${total:.2f}"
    )
    return {
        "ok": True,
        "action": "create_booking",
        "args": {"movie_id": movie_id, "showtime": showtime, "seats": seats},
        "summary": summary,
    }


def _propose_cancellation(args: dict, user: dict, sb) -> dict:
    booking_id = args.get("booking_id")
    res = sb.table("bookings").select("*").eq("id", booking_id).execute()
    if not res.data:
        return {"ok": False, "error": "Booking not found"}
    b = res.data[0]
    if b.get("user_id") != user["id"]:
        return {"ok": False, "error": "That booking isn't yours to cancel"}
    m = sb.table("movies").select("title").eq("id", b["movie_id"]).execute()
    title = m.data[0]["title"] if m.data else f"movie {b['movie_id']}"
    summary = (
        f"Cancel booking #{booking_id}: {len(b.get('seats') or [])} seat(s) "
        f"for {title} at {b.get('showtime')}"
    )
    return {
        "ok": True,
        "action": "cancel_booking",
        "args": {"booking_id": booking_id},
        "summary": summary,
    }


PROPOSE_DISPATCH = {
    "propose_booking": _propose_booking,
    "propose_cancellation": _propose_cancellation,
}


# ---------------------------------------------------------------------------
# ReAct loop with propose/confirm pause.
# ---------------------------------------------------------------------------
def stream_agent_chat(messages, user: dict) -> Iterator[dict]:
    client = get_deepseek_client()
    sb = get_supabase()
    system_text, prompt_obj = get_prompt("agent-advanced-system")

    convo = [{"role": "system", "content": system_text}] + [
        {"role": m.role, "content": m.content} for m in messages
    ]

    for _ in range(MAX_ITERATIONS):
        kwargs = {
            "model": DEEPSEEK_MODEL,
            "messages": convo,
            "tools": ALL_TOOLS,
            "tool_choice": "auto",
            "temperature": 0.3,
        }
        if prompt_obj is not None:
            kwargs["langfuse_prompt"] = prompt_obj
        resp = client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message
        tool_calls = msg.tool_calls or []

        if not tool_calls:
            if msg.content:
                yield {"type": "delta", "content": msg.content}
            return

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

        # Process every tool call so the conversation stays consistent even if
        # we end up continuing the loop. If a proposal succeeds, we emit the
        # confirm_request after the whole turn and stop (pause for the human).
        pending_confirm = None
        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            yield {"type": "tool_call", "name": name, "args": args}

            if name in PROPOSE_DISPATCH:
                proposal = PROPOSE_DISPATCH[name](args, user, sb)
                convo.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(proposal, default=str),
                    }
                )
                if proposal.get("ok"):
                    yield {"type": "tool_result", "name": name, "summary": "ready to confirm"}
                    # First successful proposal wins; ignore any siblings.
                    if pending_confirm is None:
                        pending_confirm = {
                            "type": "confirm_request",
                            "action": proposal["action"],
                            "args": proposal["args"],
                            "summary": proposal["summary"],
                        }
                else:
                    yield {
                        "type": "tool_result",
                        "name": name,
                        "summary": proposal.get("error", "could not prepare"),
                    }
            else:
                fn = READ_DISPATCH.get(name)
                if fn is None:
                    result, summary = {"error": f"Unknown tool: {name}"}, "unknown tool"
                else:
                    try:
                        result, summary = fn(args, user, sb)
                    except Exception as exc:  # noqa: BLE001 — surface to model
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

        if pending_confirm is not None:
            yield pending_confirm
            return  # pause for human confirmation

    yield {
        "type": "delta",
        "content": (
            "\n\n[Stopped after several steps without reaching an answer. "
            "Try rephrasing your request.]"
        ),
    }
