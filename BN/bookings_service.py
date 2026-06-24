"""Booking write logic — the single source of truth shared by the REST route
(`POST /bookings`) and the action-taking agent (`/chat/agent/execute`).

Why a service module: the seat-clash + pricing rules must live in exactly one
place, and the actual write must be **atomic** so two concurrent confirmations
for the same seat cannot both succeed. supabase-py has no multi-statement
transactions, so the write goes through the `create_booking_tx` Postgres
function (see schema.sql) which inserts the booking and its per-seat lock rows
in one transaction and raises `SEAT_CLASH` on a unique-violation.
"""
from __future__ import annotations

from typing import List, Optional, Tuple

from fastapi import HTTPException

from database import get_supabase


def validate_and_price_booking(
    sb, movie_id: int, showtime: str, seats: List[str]
) -> Tuple[dict, float]:
    """Shared validation used by both propose (dry-run) and execute (write).

    Returns (movie_row, total). Raises HTTPException(404/400/409) on any
    problem. The seat-clash read here is a fast, friendly check; the DB-level
    unique constraint in `create_booking_tx` is what actually prevents the race.
    """
    movie_res = sb.table("movies").select("*").eq("id", movie_id).execute()
    if not movie_res.data:
        raise HTTPException(status_code=404, detail="Movie not found")
    movie = movie_res.data[0]

    if showtime not in (movie.get("showtimes") or []):
        raise HTTPException(status_code=400, detail="Invalid showtime for this movie")

    if not seats:
        raise HTTPException(status_code=400, detail="No seats selected")
    # De-dupe while preserving the caller's order.
    seen: set = set()
    deduped = [s for s in seats if not (s in seen or seen.add(s))]

    existing = (
        sb.table("bookings")
        .select("seats")
        .eq("movie_id", movie_id)
        .eq("showtime", showtime)
        .execute()
    )
    taken: set = set()
    for row in existing.data or []:
        taken.update(row.get("seats") or [])
    clash = sorted(set(deduped) & taken)
    if clash:
        raise HTTPException(
            status_code=409, detail=f"Seats already booked: {', '.join(clash)}"
        )

    total = round(float(movie["price"]) * len(deduped), 2)
    return movie, total


def execute_create_booking(
    sb,
    user: dict,
    movie_id: int,
    showtime: str,
    seats: List[str],
    customer_name: Optional[str] = None,
    customer_email: Optional[str] = None,
) -> dict:
    """Create a booking atomically. The ONLY place a booking row is written.

    customer_name/email default to the session user's details (the agent path
    has no checkout form); the REST route passes the values from its payload.
    """
    movie, total = validate_and_price_booking(sb, movie_id, showtime, seats)
    seen: set = set()
    seats = [s for s in seats if not (s in seen or seen.add(s))]

    name = customer_name or user.get("full_name") or user.get("email")
    email = customer_email or user.get("email")

    try:
        res = sb.rpc(
            "create_booking_tx",
            {
                "p_user_id": user["id"],
                "p_movie_id": movie_id,
                "p_showtime": showtime,
                "p_seats": seats,
                "p_customer_name": name,
                "p_customer_email": email,
                "p_total": total,
            },
        ).execute()
    except Exception as exc:  # noqa: BLE001 — inspect the DB error message
        if "SEAT_CLASH" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="Those seats were just taken — please pick different ones.",
            )
        raise

    booking = res.data
    if isinstance(booking, list):
        booking = booking[0] if booking else None
    if not booking:
        raise HTTPException(status_code=500, detail="Failed to create booking")

    booking["movie_title"] = movie["title"]
    return booking


def execute_cancel_booking(sb, user: dict, booking_id: int) -> dict:
    """Cancel a booking the caller owns. Hard delete → the `booking_seats`
    rows cascade away, freeing the seats."""
    res = sb.table("bookings").select("*").eq("id", booking_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking = res.data[0]
    if booking.get("user_id") != user["id"]:
        raise HTTPException(
            status_code=403, detail="You can only cancel your own bookings"
        )

    sb.table("bookings").delete().eq("id", booking_id).execute()
    return {
        "status": "cancelled",
        "booking_id": booking_id,
        "freed_seats": booking.get("seats") or [],
    }
