"""Server-side feature flags for gating experimental chat capabilities.

Flags live in the `feature_flags` table and are toggled by admins via
`PUT /feature-flags/{key}`. They apply globally to every user, so flipping a
flag off instantly reverts all users to the baseline behaviour — which is the
whole point: you can turn a capability on, try the chat, turn it off, and try
the same prompt again to compare.

`KNOWN_FLAGS` is the source of truth for which capabilities exist and their
default state. `seed_flags()` runs on startup (mirroring `seed_prompts()` in
observability.py) and inserts any missing rows, so shipping a new capability is
just one more entry in this list.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List

from database import get_supabase

log = logging.getLogger("uvicorn.error")


# Add a new capability here and it appears (disabled) in the admin panel on the
# next startup. The `tools` flag gates the agentic /chat/agent endpoint.
KNOWN_FLAGS: List[dict] = [
    {
        "key": "tools",
        "label": "Tool use",
        "description": (
            "Let CineBot call read-only tools — catalog search, movie details, "
            "showtimes, seat availability, the signed-in user's bookings, and "
            "the current date/time — so it answers from live data instead of "
            "general knowledge."
        ),
        "default": False,
    },
]

DEFAULTS = {f["key"]: f for f in KNOWN_FLAGS}


def seed_flags() -> None:
    """Insert any missing known flags (default disabled). Idempotent."""
    sb = get_supabase()
    try:
        existing = sb.table("feature_flags").select("key").execute()
        have = {r["key"] for r in (existing.data or [])}
    except Exception as exc:  # table missing / bad creds — log, don't crash
        log.warning("Could not read feature_flags (is the table created?): %s", exc)
        return
    for f in KNOWN_FLAGS:
        if f["key"] in have:
            continue
        try:
            sb.table("feature_flags").insert(
                {
                    "key": f["key"],
                    "enabled": f["default"],
                    "label": f["label"],
                    "description": f["description"],
                }
            ).execute()
            log.info("Seeded feature flag '%s'", f["key"])
        except Exception as exc:
            log.warning("Could not seed flag '%s': %s", f["key"], exc)


def list_flags() -> List[dict]:
    """All flags, ordered by key. Backfills label/description from KNOWN_FLAGS."""
    sb = get_supabase()
    res = sb.table("feature_flags").select("*").order("key").execute()
    rows = res.data or []
    for row in rows:
        meta = DEFAULTS.get(row["key"])
        if meta:
            row.setdefault("label", meta["label"])
            row.setdefault("description", meta["description"])
            if not row.get("label"):
                row["label"] = meta["label"]
            if not row.get("description"):
                row["description"] = meta["description"]
    return rows


def set_flag(key: str, enabled: bool) -> dict:
    """Flip a flag. Raises KeyError if the flag does not exist."""
    sb = get_supabase()
    res = (
        sb.table("feature_flags")
        .update(
            {
                "enabled": enabled,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("key", key)
        .execute()
    )
    if not res.data:
        raise KeyError(key)
    return res.data[0]


def is_enabled(key: str) -> bool:
    """Cheap check used to gate endpoints. Falls back to the coded default."""
    sb = get_supabase()
    try:
        res = (
            sb.table("feature_flags")
            .select("enabled")
            .eq("key", key)
            .limit(1)
            .execute()
        )
        if res.data:
            return bool(res.data[0]["enabled"])
    except Exception as exc:
        log.warning("Could not read flag '%s': %s", key, exc)
    return bool(DEFAULTS.get(key, {}).get("default", False))
