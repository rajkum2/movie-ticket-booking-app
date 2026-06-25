"""Per-user agent memory — durable facts the agent can recall across sessions.

Same machinery as RAG (Jina embeddings + pgvector), but pointed at per-user
facts instead of shared documents, and stored in `user_memories`. Exposes two
agent tools, gated by the `memory` feature flag:

  * recall_memory(query) — semantic search over THIS user's saved facts (read)
  * remember(fact)       — save a durable preference about THIS user (write)

Safety: the user id is always taken from the auth context and enforced inside
`match_user_memories(p_user_id, ...)` — never from tool args — so one user can
never read or write another's memories (same property as get_my_bookings).
"""
from __future__ import annotations

import logging
from typing import List

from rag import embed_texts  # reuse the Jina embedding client

log = logging.getLogger("uvicorn.error")

RECALL_LIMIT = 5
RECALL_THRESHOLD = 0.3


# ---------------------------------------------------------------------------
# Core read/write
# ---------------------------------------------------------------------------
def recall(user_id: int, query: str, sb, k: int = RECALL_LIMIT,
           threshold: float = RECALL_THRESHOLD) -> List[dict]:
    query = (query or "").strip()
    if not query:
        return []
    vecs = embed_texts([query], task="retrieval.query")
    if not vecs:
        return []
    res = sb.rpc(
        "match_user_memories",
        {
            "p_user_id": user_id,
            "query_embedding": vecs[0],
            "match_threshold": threshold,
            "match_count": k,
        },
    ).execute()
    return res.data or []


def remember(user_id: int, fact: str, sb) -> dict | None:
    fact = (fact or "").strip()
    if not fact:
        return None
    vecs = embed_texts([fact], task="retrieval.passage")
    if not vecs:
        return None
    ins = (
        sb.table("user_memories")
        .insert({"user_id": user_id, "content": fact, "embedding": vecs[0]})
        .execute()
    )
    return ins.data[0] if ins.data else None


def list_memories(user_id: int, sb) -> List[dict]:
    res = (
        sb.table("user_memories")
        .select("id,content,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def delete_memory(user_id: int, memory_id: int, sb) -> None:
    # eq on user_id too — a user can only delete their own memories.
    sb.table("user_memories").delete().eq("id", memory_id).eq(
        "user_id", user_id
    ).execute()


# ---------------------------------------------------------------------------
# Agent tools (added to the agent's toolset when the `memory` flag is on)
# ---------------------------------------------------------------------------
MEMORY_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "recall_memory",
            "description": (
                "Recall durable facts you previously saved about THIS user "
                "(their preferences, history). Call this when the user's past "
                "preferences would help you personalise an answer."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to recall, e.g. 'seating and genre preferences'.",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remember",
            "description": (
                "Save a durable fact or preference about THIS user for future "
                "conversations (e.g. 'prefers evening shows', 'loves sci-fi'). "
                "Only save lasting preferences the user expresses — never "
                "passwords, payment details, or one-off requests."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "fact": {
                        "type": "string",
                        "description": "The concise fact to remember.",
                    }
                },
                "required": ["fact"],
            },
        },
    },
]


def _tool_recall_memory(args: dict, user: dict, sb) -> tuple:
    query = (args.get("query") or "").strip()
    rows = recall(user["id"], query, sb) if query else []
    mems = [r.get("content") for r in rows]
    return {"count": len(mems), "memories": mems}, f"recalled {len(mems)} memory(ies)"


def _tool_remember(args: dict, user: dict, sb) -> tuple:
    fact = (args.get("fact") or "").strip()
    if not fact:
        return {"saved": False, "error": "empty fact"}, "nothing to save"
    row = remember(user["id"], fact, sb)
    short = fact if len(fact) <= 60 else fact[:57] + "…"
    return {"saved": bool(row), "fact": fact}, f"remembered: {short}"


MEMORY_DISPATCH = {
    "recall_memory": _tool_recall_memory,
    "remember": _tool_remember,
}

# Appended to the agent's system prompt when the `memory` flag is on.
MEMORY_PROMPT_SNIPPET = (
    "\n\nMemory: you can remember things about this user across conversations. "
    "Call recall_memory when their saved preferences would help personalise an "
    "answer, and call remember when they share a durable preference (e.g. "
    "favourite genre, preferred showtimes). Never store passwords, payment "
    "details, or sensitive personal data."
)
