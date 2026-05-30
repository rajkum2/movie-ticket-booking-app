"""Movie Ticket Booking API.

FastAPI service backed by Supabase (Postgres). Now with auth + roles.

Auth
----
* POST /auth/login        -> { token, user }
* POST /auth/register     -> create a normal user
* POST /auth/google       -> exchange Supabase Google JWT for our session
* POST /auth/logout       -> invalidate current session
* GET  /auth/me           -> current user

Movies
------
* GET  /movies            (public)
* GET  /movies/{id}       (public)
* POST /movies            (admin)
* PUT  /movies/{id}       (admin)
* DELETE /movies/{id}     (admin)

Seats / bookings
----------------
* GET  /movies/{id}/seats?showtime=... (public)
* POST /bookings           (user)   - attaches caller as user_id
* GET  /bookings           (admin)  - all bookings
* GET  /bookings/me        (user)   - current user's bookings

Users (admin-only)
------------------
* GET  /users
* POST /users
* PUT  /users/{id}
* DELETE /users/{id}
"""
import logging
import os
from typing import List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from auth import (
    get_current_user,
    hash_password,
    new_session_token,
    public_user,
    require_admin,
    verify_password,
)
from database import get_supabase
from storage import ALLOWED_CONTENT_TYPES, MAX_POSTER_BYTES, upload_poster
from summariser import stream_summary
from search import SearchFilters, SearchQuery, parse_query
from chat import ChatRequest, stream_chat
from models import (
    Booking,
    BookingCreate,
    GoogleLoginRequest,
    LoginRequest,
    LoginResponse,
    Movie,
    MovieCreate,
    MovieUpdate,
    SeatAvailability,
    User,
    UserCreate,
    UserUpdate,
)

log = logging.getLogger("uvicorn.error")

app = FastAPI(title="Movie Ticket Booking API", version="2.0.0")

# CORS
allowed = os.environ.get("ALLOWED_ORIGINS", "*")
origins = ["*"] if allowed.strip() == "*" else [o.strip() for o in allowed.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Startup: ensure two demo accounts exist with known passwords.
# ---------------------------------------------------------------------------
DEMO_ACCOUNTS = [
    {
        "email": "admin@cinebook.com",
        "password": "admin123",
        "full_name": "Admin User",
        "role": "admin",
    },
    {
        "email": "user@cinebook.com",
        "password": "user123",
        "full_name": "Demo User",
        "role": "user",
    },
]

# Old demo emails used a reserved `.test` TLD that Pydantic's EmailStr rejects.
# Clean them up on startup so they don't sit around un-loginable.
LEGACY_DEMO_EMAILS = ["admin@cinebook.test", "user@cinebook.test"]


@app.on_event("startup")
def seed_demo_users() -> None:
    sb = get_supabase()
    try:
        existing = sb.table("users").select("email").execute().data or []
    except Exception as exc:  # table missing, bad creds — log but don't crash
        log.warning("Could not check users table at startup: %s", exc)
        return

    # Remove any legacy demo accounts created with the reserved `.test` TLD.
    existing_emails = {r["email"] for r in existing}
    legacy_present = [e for e in LEGACY_DEMO_EMAILS if e in existing_emails]
    if legacy_present:
        sb.table("users").delete().in_("email", legacy_present).execute()
        log.info("Removed legacy demo accounts: %s", ", ".join(legacy_present))
        existing_emails -= set(legacy_present)

    for acct in DEMO_ACCOUNTS:
        if acct["email"] in existing_emails:
            continue
        sb.table("users").insert(
            {
                "email": acct["email"],
                "password_hash": hash_password(acct["password"]),
                "full_name": acct["full_name"],
                "role": acct["role"],
            }
        ).execute()
        log.info("Seeded demo %s account: %s", acct["role"], acct["email"])


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/")
def health():
    return {"status": "ok", "service": "movie-ticket-booking-api"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    sb = get_supabase()
    res = (
        sb.table("users").select("*").eq("email", payload.email.lower()).limit(1).execute()
    )
    if not res.data or not verify_password(payload.password, res.data[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = res.data[0]
    token = new_session_token()
    sb.table("users").update({"session_token": token}).eq("id", user["id"]).execute()
    return {"token": token, "user": public_user(user)}


@app.post("/auth/register", response_model=LoginResponse, status_code=201)
def register(payload: UserCreate):
    """Self-register a normal user. Role is forced to 'user'."""
    sb = get_supabase()
    email = payload.email.lower()
    existing = sb.table("users").select("id").eq("email", email).limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already registered")

    token = new_session_token()
    insert = (
        sb.table("users")
        .insert(
            {
                "email": email,
                "password_hash": hash_password(payload.password),
                "full_name": payload.full_name,
                "role": "user",
                "session_token": token,
            }
        )
        .execute()
    )
    if not insert.data:
        raise HTTPException(status_code=500, detail="Failed to create user")
    return {"token": token, "user": public_user(insert.data[0])}


@app.post("/auth/google", response_model=LoginResponse)
def google_login(payload: GoogleLoginRequest):
    """Exchange a Supabase Google-OAuth JWT for one of our session tokens.

    Flow: the browser completes Google OAuth via Supabase Auth, gets a JWT,
    and sends it here. We validate it through supabase-py (which calls
    /auth/v1/user), then upsert a row in our local users table so the rest
    of the app (RBAC, bookings, etc.) keeps working unchanged.
    """
    sb = get_supabase()
    try:
        resp = sb.auth.get_user(payload.access_token)
    except Exception as exc:
        log.warning("Supabase JWT validation failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Google session") from exc

    su = getattr(resp, "user", None)
    if not su or not su.email:
        raise HTTPException(status_code=401, detail="Google session has no email")

    email = su.email.lower()
    full_name = (
        (su.user_metadata or {}).get("full_name")
        or (su.user_metadata or {}).get("name")
    )

    existing = sb.table("users").select("*").eq("email", email).limit(1).execute()
    token = new_session_token()
    if existing.data:
        row = existing.data[0]
        updates: dict = {"session_token": token}
        if not row.get("full_name") and full_name:
            updates["full_name"] = full_name
        sb.table("users").update(updates).eq("id", row["id"]).execute()
        row.update(updates)
    else:
        ins = (
            sb.table("users")
            .insert(
                {
                    "email": email,
                    "password_hash": None,
                    "full_name": full_name,
                    "role": "user",
                    "session_token": token,
                }
            )
            .execute()
        )
        if not ins.data:
            raise HTTPException(status_code=500, detail="Failed to provision user")
        row = ins.data[0]

    return {"token": token, "user": public_user(row)}


@app.post("/auth/logout")
def logout(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    sb.table("users").update({"session_token": None}).eq("id", user["id"]).execute()
    return {"status": "ok"}


@app.get("/auth/me", response_model=User)
def me(user: dict = Depends(get_current_user)):
    return public_user(user)


# ---------------------------------------------------------------------------
# Movies
# ---------------------------------------------------------------------------
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


@app.post("/movies", response_model=Movie, status_code=201)
def create_movie(payload: MovieCreate, _: dict = Depends(require_admin)):
    sb = get_supabase()
    insert = sb.table("movies").insert(payload.model_dump()).execute()
    if not insert.data:
        raise HTTPException(status_code=500, detail="Failed to create movie")
    return insert.data[0]


@app.put("/movies/{movie_id}", response_model=Movie)
def update_movie(
    movie_id: int, payload: MovieUpdate, _: dict = Depends(require_admin)
):
    sb = get_supabase()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = sb.table("movies").update(updates).eq("id", movie_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Movie not found")
    return res.data[0]


@app.delete("/movies/{movie_id}", status_code=204)
def delete_movie(movie_id: int, _: dict = Depends(require_admin)):
    sb = get_supabase()
    sb.table("movies").delete().eq("id", movie_id).execute()
    return None


# ---------------------------------------------------------------------------
# AI Summariser — streams a DeepSeek-generated summary, caches on first call.
# ---------------------------------------------------------------------------
@app.post("/movies/{movie_id}/summarise")
def summarise_movie(movie_id: int, _: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("movies")
        .select("id,title,ai_summary")
        .eq("id", movie_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Movie not found")
    movie = res.data[0]

    cached = (movie.get("ai_summary") or "").strip()
    if cached:
        # Replay the cached summary as a single stream chunk so the frontend
        # can treat cached vs fresh responses identically.
        def replay():
            yield cached
        return StreamingResponse(replay(), media_type="text/plain")

    def generate():
        collected: list[str] = []
        try:
            for delta in stream_summary(movie["title"]):
                collected.append(delta)
                yield delta
        except RuntimeError as exc:  # missing API key
            log.error("DeepSeek not configured: %s", exc)
            yield "\n\n[Summariser is not configured on the server.]"
            return
        except Exception as exc:
            log.exception("DeepSeek call failed")
            yield f"\n\n[Error generating summary: {exc}]"
            return

        full = "".join(collected).strip()
        if not full:
            return
        try:
            sb.table("movies").update({"ai_summary": full}).eq(
                "id", movie_id
            ).execute()
        except Exception as exc:
            log.warning("Could not cache summary for movie %s: %s", movie_id, exc)

    return StreamingResponse(generate(), media_type="text/plain")


# ---------------------------------------------------------------------------
# AI Chat — multi-turn movie conversation, streams the assistant reply.
# ---------------------------------------------------------------------------
@app.post("/chat")
def chat(payload: ChatRequest, _: dict = Depends(get_current_user)):
    if payload.messages[-1].role != "user":
        raise HTTPException(
            status_code=400, detail="Last message must be from the user"
        )

    def generate():
        try:
            for delta in stream_chat(payload.messages):
                yield delta
        except RuntimeError as exc:  # DEEPSEEK_API_KEY missing
            log.error("DeepSeek not configured: %s", exc)
            yield "\n\n[Chat is not configured on the server.]"
        except Exception as exc:
            log.exception("Chat call failed")
            yield f"\n\n[Error: {exc}]"

    return StreamingResponse(generate(), media_type="text/plain")


# ---------------------------------------------------------------------------
# Natural-language search parser — turns a typed/spoken query into filters
# ---------------------------------------------------------------------------
@app.post("/search/parse", response_model=SearchFilters)
def parse_search(payload: SearchQuery):
    try:
        return parse_query(payload.query)
    except RuntimeError as exc:  # DEEPSEEK_API_KEY missing
        log.error("DeepSeek not configured: %s", exc)
        raise HTTPException(status_code=503, detail="Search parser not configured")
    except Exception as exc:
        log.exception("Search parse failed")
        raise HTTPException(status_code=502, detail="Could not parse query") from exc


# ---------------------------------------------------------------------------
# Uploads (admin) — Cloudflare R2 via S3-compatible API
# ---------------------------------------------------------------------------
@app.post("/uploads/poster")
async def upload_movie_poster(
    file: UploadFile = File(...),
    _: dict = Depends(require_admin),
):
    """Upload a movie poster image to R2 and return its public URL."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}",
        )
    data = await file.read()
    if len(data) > MAX_POSTER_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_POSTER_BYTES // (1024 * 1024)} MB)",
        )
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        url, key = upload_poster(data, file.content_type)
    except RuntimeError as exc:  # missing env var
        log.error("R2 not configured: %s", exc)
        raise HTTPException(status_code=503, detail="Storage not configured") from exc
    except Exception as exc:
        log.exception("Poster upload failed")
        raise HTTPException(status_code=502, detail="Upload to R2 failed") from exc

    return {"url": url, "key": key}


# ---------------------------------------------------------------------------
# Seats / bookings
# ---------------------------------------------------------------------------
@app.get("/movies/{movie_id}/seats", response_model=SeatAvailability)
def get_seat_availability(movie_id: int, showtime: str = Query(...)):
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
def create_booking(payload: BookingCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase()

    movie_res = sb.table("movies").select("*").eq("id", payload.movie_id).execute()
    if not movie_res.data:
        raise HTTPException(status_code=404, detail="Movie not found")
    movie = movie_res.data[0]

    if payload.showtime not in (movie.get("showtimes") or []):
        raise HTTPException(status_code=400, detail="Invalid showtime for this movie")

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
                "user_id": user["id"],
                "showtime": payload.showtime,
                "customer_name": payload.customer_name,
                "customer_email": payload.customer_email,
                "seats": payload.seats,
                "total_amount": total,
                "payment_status": "PAID",
            }
        )
        .execute()
    )
    if not insert.data:
        raise HTTPException(status_code=500, detail="Failed to create booking")

    booking = insert.data[0]
    booking["movie_title"] = movie["title"]
    return booking


def _attach_movie_titles(sb, bookings: List[dict]) -> List[dict]:
    movie_ids = list({b["movie_id"] for b in bookings})
    titles: dict = {}
    if movie_ids:
        m_res = sb.table("movies").select("id,title").in_("id", movie_ids).execute()
        titles = {m["id"]: m["title"] for m in (m_res.data or [])}
    for b in bookings:
        b["movie_title"] = titles.get(b["movie_id"])
    return bookings


@app.get("/bookings", response_model=List[Booking])
def list_bookings(_: dict = Depends(require_admin)):
    """Admin: every booking, newest first."""
    sb = get_supabase()
    res = sb.table("bookings").select("*").order("created_at", desc=True).execute()
    return _attach_movie_titles(sb, res.data or [])


@app.get("/bookings/me", response_model=List[Booking])
def list_my_bookings(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("bookings")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return _attach_movie_titles(sb, res.data or [])


# ---------------------------------------------------------------------------
# Users (admin)
# ---------------------------------------------------------------------------
@app.get("/users", response_model=List[User])
def list_users(_: dict = Depends(require_admin)):
    sb = get_supabase()
    res = sb.table("users").select("*").order("id").execute()
    return [public_user(u) for u in (res.data or [])]


@app.post("/users", response_model=User, status_code=201)
def create_user(payload: UserCreate, _: dict = Depends(require_admin)):
    sb = get_supabase()
    email = payload.email.lower()
    existing = sb.table("users").select("id").eq("email", email).limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already registered")
    insert = (
        sb.table("users")
        .insert(
            {
                "email": email,
                "password_hash": hash_password(payload.password),
                "full_name": payload.full_name,
                "role": payload.role,
            }
        )
        .execute()
    )
    if not insert.data:
        raise HTTPException(status_code=500, detail="Failed to create user")
    return public_user(insert.data[0])


@app.put("/users/{user_id}", response_model=User)
def update_user(
    user_id: int, payload: UserUpdate, admin: dict = Depends(require_admin)
):
    sb = get_supabase()
    updates: dict = {}
    if payload.email is not None:
        updates["email"] = payload.email.lower()
    if payload.full_name is not None:
        updates["full_name"] = payload.full_name
    if payload.role is not None:
        updates["role"] = payload.role
    if payload.password is not None:
        updates["password_hash"] = hash_password(payload.password)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if (
        payload.role is not None
        and user_id == admin["id"]
        and payload.role != "admin"
    ):
        raise HTTPException(
            status_code=400, detail="You cannot demote yourself from admin"
        )

    res = sb.table("users").update(updates).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return public_user(res.data[0])


@app.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    sb = get_supabase()
    sb.table("users").delete().eq("id", user_id).execute()
    return None
