"""Movie Ticket Booking API.

A small FastAPI service backed by Supabase (Postgres). No authentication —
the admin view is just an unguarded endpoint that lists all bookings.

Endpoints
---------
GET  /                                  health check
GET  /movies                            list all movies
GET  /movies/{movie_id}                 single movie
GET  /movies/{movie_id}/seats           booked seats for a movie + showtime
POST /bookings                          create a booking (dummy payment)
GET  /bookings                          list all bookings (admin)
"""
import os
from typing import List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from database import get_supabase
from models import (
    Booking,
    BookingCreate,
    Movie,
    SeatAvailability,
)

app = FastAPI(title="Movie Ticket Booking API", version="1.0.0")

# CORS — allow the Vercel frontend (and local dev) to call this API.
# Set ALLOWED_ORIGINS as a comma-separated list on Railway, e.g.
#   https://my-app.vercel.app,http://localhost:5173
allowed = os.environ.get("ALLOWED_ORIGINS", "*")
origins = ["*"] if allowed.strip() == "*" else [o.strip() for o in allowed.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    return {"status": "ok", "service": "movie-ticket-booking-api"}


@app.get("/movies", response_model=List[Movie])
def list_movies():
    sb = get_supabase()
    res = sb.table("movies").select("*").order("id").execute()
    return res.data or []


@app.get("/movies/{movie_id}", response_model=Movie)
def get_movie(movie_id: int):
    sb = get_supabase()
    res = sb.table("movies").select("*").eq("id", movie_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Movie not found")
    return res.data[0]


@app.get("/movies/{movie_id}/seats", response_model=SeatAvailability)
def get_seat_availability(movie_id: int, showtime: str = Query(...)):
    """Return the set of already-booked seats for a movie + showtime."""
    sb = get_supabase()
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
    return SeatAvailability(
        movie_id=movie_id, showtime=showtime, booked_seats=sorted(set(booked))
    )


@app.post("/bookings", response_model=Booking, status_code=201)
def create_booking(payload: BookingCreate):
    sb = get_supabase()

    movie_res = sb.table("movies").select("*").eq("id", payload.movie_id).execute()
    if not movie_res.data:
        raise HTTPException(status_code=404, detail="Movie not found")
    movie = movie_res.data[0]

    if payload.showtime not in (movie.get("showtimes") or []):
        raise HTTPException(status_code=400, detail="Invalid showtime for this movie")

    # Guard against double-booking: re-check current availability.
    existing = (
        sb.table("bookings")
        .select("seats")
        .eq("movie_id", payload.movie_id)
        .eq("showtime", payload.showtime)
        .execute()
    )
    taken = set()
    for row in existing.data or []:
        taken.update(row.get("seats") or [])
    clash = sorted(set(payload.seats) & taken)
    if clash:
        raise HTTPException(
            status_code=409,
            detail=f"Seats already booked: {', '.join(clash)}",
        )

    total = round(float(movie["price"]) * len(payload.seats), 2)

    insert = (
        sb.table("bookings")
        .insert(
            {
                "movie_id": payload.movie_id,
                "showtime": payload.showtime,
                "customer_name": payload.customer_name,
                "customer_email": payload.customer_email,
                "seats": payload.seats,
                "total_amount": total,
                "payment_status": "PAID",  # dummy payment is always successful
            }
        )
        .execute()
    )
    if not insert.data:
        raise HTTPException(status_code=500, detail="Failed to create booking")

    booking = insert.data[0]
    booking["movie_title"] = movie["title"]
    return booking


@app.get("/bookings", response_model=List[Booking])
def list_bookings():
    """Admin view: every booking, newest first, with movie titles attached."""
    sb = get_supabase()
    res = sb.table("bookings").select("*").order("created_at", desc=True).execute()
    bookings = res.data or []

    # Attach movie titles in one round-trip.
    movie_ids = list({b["movie_id"] for b in bookings})
    titles = {}
    if movie_ids:
        m_res = sb.table("movies").select("id,title").in_("id", movie_ids).execute()
        titles = {m["id"]: m["title"] for m in (m_res.data or [])}

    for b in bookings:
        b["movie_title"] = titles.get(b["movie_id"])
    return bookings


# =====================
# Movie Management Endpoints (for dashboard)
# =====================

@app.post("/movies", response_model=Movie, status_code=201)
def create_movie(movie: Movie):
    """Add a new movie (used by Manage Movies dashboard)."""
    sb = get_supabase()
    data = movie.model_dump(exclude={"id"})  # id is auto-generated
    res = sb.table("movies").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create movie")
    return res.data[0]


@app.put("/movies/{movie_id}", response_model=Movie)
def update_movie(movie_id: int, movie: Movie):
    """Update an existing movie (title, price, poster, etc.)."""
    sb = get_supabase()
    data = movie.model_dump(exclude={"id"})
    res = sb.table("movies").update(data).eq("id", movie_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Movie not found")
    return res.data[0]


@app.delete("/movies/{movie_id}", status_code=204)
def delete_movie(movie_id: int):
    """Delete a movie."""
    sb = get_supabase()
    res = sb.table("movies").delete().eq("id", movie_id).execute()
    # We don't raise if not found — idempotent delete is fine
    return
