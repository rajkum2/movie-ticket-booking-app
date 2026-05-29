# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

Two independently-deployed apps in one repo:

- `BN/` — FastAPI + Supabase (Postgres). Deploys to **Railway** (root dir `BN`).
- `FN/` — React 18 + Vite + React Router. Deploys to **Vercel** (root dir `FN`).

The two halves communicate over HTTP only — `VITE_API_URL` on the frontend points at the deployed backend, and the backend's `ALLOWED_ORIGINS` env var must include the frontend's origin or CORS will block requests. There is no shared package, no codegen step, and no monorepo tooling.

## Commands

### Backend (`BN/`)
```bash
cd BN
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                # fill SUPABASE_URL + SUPABASE_KEY (service_role)
uvicorn main:app --reload           # http://localhost:8000, docs at /docs
```

There is no test suite, no linter config, no formatter config. The Procfile / `railway.json` runs `uvicorn main:app --host 0.0.0.0 --port $PORT` in production.

### Frontend (`FN/`)
```bash
cd FN
npm install
cp .env.example .env                # VITE_API_URL=http://localhost:8000
npm run dev                         # http://localhost:5173
npm run build                       # outputs to dist/
npm run preview                     # serve dist/ locally
```

No test runner, no ESLint config. Vite is the only build tool.

### Database setup
Run `BN/schema.sql` in the Supabase SQL Editor first; optionally then `BN/seed-movies.sql` for ~115 demo movies. The schema is **idempotent** — it uses `create table if not exists` and `alter table ... add column if not exists`, so re-running it on an existing DB is safe and is how new columns (`trailer_url`, `backdrop_url`, `bookings.user_id`) get backfilled.

## Architecture

### Auth: backend-issued session tokens, not Supabase Auth
This is the non-obvious part of the system. Supabase is used as a **Postgres database** via `supabase-py` (service-role key, server-side only) — it is **not** the auth provider for app sessions.

The session model:
1. On `POST /auth/login` or `/auth/register`, the backend generates a random `secrets.token_urlsafe(32)` and stores it in `users.session_token`. There is exactly **one active session per user** — a fresh login overwrites the previous token.
2. The frontend stores that token in `localStorage` under `cinebook.token` and sends it as `Authorization: Bearer <token>` on every request (see `FN/src/api.js`).
3. `auth.get_current_user` looks up the token directly in the `users` table; `require_admin` is a thin wrapper that also checks `role == "admin"`.
4. `POST /auth/logout` nulls out `session_token`.

Implication: any code that wants to call a protected endpoint goes through `api.js` (which auto-attaches the bearer). Bypassing it requires manually reading `localStorage.getItem("cinebook.token")`.

### Google sign-in: Supabase as an OAuth bridge only
`FN/src/supabaseClient.js` instantiates a Supabase client **purely** to run the Google OAuth dance and obtain a Supabase-issued JWT. That JWT is then `POST`ed to `/auth/google`, which calls `sb.auth.get_user(jwt)` to validate, upserts a row in our local `users` table, and issues one of **our** session tokens. The Supabase session is discarded immediately after (`supabase.auth.signOut()` in `finishGoogleSignIn`).

Two consequences:
- Google-provisioned users have `password_hash = NULL`. `verify_password` returns False for null hashes, so they cannot log in via the password endpoint.
- The Supabase client is only created when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are both set. `googleEnabled` (exported from `auth.jsx`) reflects this and gates the Google button.

### Demo users seeded on startup
`main.py`'s `@app.on_event("startup")` (`seed_demo_users`) ensures `admin@cinebook.com` / `admin123` and `user@cinebook.com` / `user123` exist with bcrypt hashes, and also **deletes** any rows with the legacy `.test`-TLD emails (Pydantic's `EmailStr` rejects the reserved `.test` TLD, leaving those accounts un-loginable). When changing demo creds, update `DEMO_ACCOUNTS` — don't put passwords in `schema.sql`.

### Booking seat-clash check is not transactional
`POST /bookings` reads existing seats for `(movie_id, showtime)`, intersects with the requested seats, and rejects on overlap — but this is two separate Supabase calls with no row-level locking. Two concurrent bookings for the same seat can both pass the check. If you add concurrency guarantees, do it at the DB layer (unique constraint on `(movie_id, showtime, seat)` after normalizing, or a Postgres function).

`movies.showtimes` and `bookings.seats` are both **JSONB arrays of strings**, not normalized tables. Seats are free-text labels like `"A1"`; showtimes are display strings like `"06:00 PM"`. `BookingCreate` validates that `showtime` is in the movie's `showtimes` list.

### Frontend auth state
`FN/src/auth.jsx` holds the user in a React context and mirrors it to `localStorage` (`cinebook.user`) so a page refresh is instant. On mount, if a token exists, it calls `/auth/me` to revalidate — if that fails the token + user are cleared. Routes that need a logged-in user use `<RequireAuth>`; admin-only routes use `<RequireAuth role="admin">`.

### AI Summariser: DeepSeek over OpenAI-compatible API
`BN/summariser.py` calls DeepSeek via the `openai` SDK pointed at `https://api.deepseek.com/v1` (model `deepseek-chat`). `POST /movies/{id}/summarise` is login-gated, streams the response as `text/plain`, and caches the final text in `movies.ai_summary` so subsequent calls replay the cache as a single chunk (the frontend doesn't need to distinguish). The frontend reader (`api.streamSummary` in `FN/src/api.js`) is an async generator that yields decoded chunks; the `Summariser` page appends them to state as they arrive. Set `DEEPSEEK_API_KEY` in `BN/.env` / Railway — the endpoint returns an inline error chunk if it is missing rather than failing the request.

### Storage: Cloudflare R2
`BN/storage.py` talks to R2 via boto3 (S3-compatible). `POST /uploads/poster` is admin-only, enforces a 5 MB cap and a fixed list of `image/{jpeg,png,webp}` content types, generates a UUID-based key under `posters/`, and returns `{ url, key }`. The frontend uses the returned URL as `poster_url` when creating/updating a movie. R2 envs are all required (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`); the route returns 503 if any are missing rather than crashing on startup.

### Environment variables — what is read where

Backend (`BN/.env`, or Railway Variables):
- `SUPABASE_URL`, `SUPABASE_KEY` (service_role) — required, read in `database.py`
- `ALLOWED_ORIGINS` — comma-separated, or `*`. Read in `main.py` for CORS.
- `R2_*` — required only if `/uploads/poster` is used.
- `DEEPSEEK_API_KEY` — required only if `/movies/{id}/summarise` is used.

Frontend (`FN/.env`, or Vercel env vars):
- `VITE_API_URL` — required, the backend's base URL.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — optional; Google sign-in is hidden when unset.

After deploying the frontend, **add the Vercel URL to Railway's `ALLOWED_ORIGINS`** or CORS will block real requests (you'll see them succeed only from `localhost`).
