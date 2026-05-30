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

### Observability + prompt management: Langfuse
All LLM calls (summariser, chat, RAG chat, search parser) are traced via **Langfuse** (`BN/observability.py`). The DeepSeek client is imported from `langfuse.openai`, which auto-captures prompt/response/tokens/cost/latency on every completion. Trace IDs are pre-generated server-side, exposed to the browser via the `X-Trace-Id` response header (CORS `expose_headers` includes it), then used by the frontend to POST thumbs feedback to `/traces/{id}/score`.

**System prompts live in Langfuse**, not in code. Each module fetches its prompt by name with `observability.get_prompt(name)` — currently `summariser-system`, `chat-system`, `search-parser-system`, `rag-grounding-preamble`. The original text is kept in `DEFAULT_PROMPTS` (also in `observability.py`) so the app degrades gracefully if Langfuse is unreachable or a prompt has been deleted. On startup, `seed_prompts()` creates any missing prompts using these defaults — so a fresh Langfuse project gets pre-populated automatically.

Editing a prompt: log into Langfuse → Prompts → pick one → edit → publish to label `production`. Next request picks it up without a redeploy. Old versions are kept in history; every trace records *which version* was used, so a thumbs-down on a trace immediately tells you which prompt was live at the time.

When Langfuse keys are not set, `get_langfuse()` returns `None` and everything else (tracing, prompt fetching, scoring) silently no-ops — useful for local dev without forcing every contributor to sign up. Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and (optionally) `LANGFUSE_HOST` in `.env` / Railway.

`TraceContext` in `observability.py` is the helper that wraps each streaming generator in a Langfuse span with a pre-generated trace_id; this is the only way to get the ID into the response header *before* the stream starts.

### RAG knowledge base: pgvector + Jina embeddings
Admin-uploaded documents (`.txt` / `.pdf` / `.docx` / pasted text) are chunked (800 chars, 120 overlap), embedded via **Jina `jina-embeddings-v3`** (1024 dims, free tier), and stored in `rag_chunks` with a pgvector `vector(1024)` column. Jina is a **stateless embedding service** — nothing is stored at Jina; the vectors live in Supabase. The original uploaded file is discarded after extraction (only the extracted text + vectors persist).

Retrieval uses a Postgres function `match_rag_chunks(query_embedding, threshold, count)` called via `sb.rpc()`. supabase-py doesn't natively support pgvector operators, so RPC is the canonical workaround.

`POST /chat/rag` does retrieval → builds a soft-grounded system prompt → streams NDJSON (`{"type":"sources",...}` then many `{"type":"delta",...}` then `{"type":"done"}`). The frontend `Chat.jsx` toggle picks between `streamChat` (plain text) and `streamRagChat` (NDJSON) — two protocols share the page state.

Schema: re-run `BN/schema.sql` after adding RAG to get the `create extension vector`, both new tables, the HNSW index, and the `match_rag_chunks` function. Env: add `JINA_API_KEY` to Railway. Deps: `pypdf`, `python-docx`, `httpx` (added to `requirements.txt`).

**Query reformulation**: before the vector search, `/chat/rag` calls `rag.reformulate_query(messages)` — a small DeepSeek call that rewrites the latest user message as a self-contained query using the conversation history (last 10 turns). This closes the gap where retrieval only sees the last message while generation sees the whole history — without it, a follow-up like "what's the release date?" after discussing Missamma would embed without any anchor and return zero matches. The reformulator falls back silently to the raw message if the LLM call fails. Its system prompt lives in Langfuse as `rag-query-reformulator`.

**Title-prepending in ingestion**: `_embed_with_title()` prepends `[Document Title]\n` to each chunk *before* sending it to Jina. The stored `rag_chunks.content` stays raw — only the embedding incorporates the title. This bakes the document's identity into every chunk's vector so queries that mention the doc title retrieve all relevant chunks (not just the one that happens to repeat the title in its body). After changing this strategy, hit the admin **"Re-ingest all"** button (calls `POST /rag/reingest` → `rag.reingest_all_documents()`) to refresh existing embeddings without re-uploading the source files.

When extending RAG (re-ranking, hybrid keyword+vector, citations to file storage), start in `BN/rag.py` — every retrieval+ingestion step is isolated there.

### AI Chat: multi-turn DeepSeek conversation
`BN/chat.py` holds the system prompt that scopes the assistant ("CineBot") to film topics. `POST /chat` is login-gated, takes `{ messages: [{role, content}] }` (last must be `role: "user"`), prepends the system prompt, and streams the assistant reply as `text/plain` via the same `StreamingResponse` pattern as the summariser. **No DB persistence** — the conversation lives in `Chat.jsx` component state. The frontend sends the full history on every turn, so context cost grows linearly; `ChatRequest` caps `messages` at 40 and each `content` at 4000 chars as a guardrail. Temperature is `0.6` (warmer than the summariser/search-parser to make replies more conversational). When extending the assistant — e.g. tool-calling, catalog awareness, persistence — start from `chat.py` and the request model in `BN/chat.py`.

### Voice search: Web Speech API + DeepSeek filter parsing
`FN/src/components/VoiceSearchButton.jsx` uses the browser's `SpeechRecognition` API (free, Chrome/Safari only — feature-detected, hidden when absent). The transcript is sent to `POST /search/parse`, which calls DeepSeek in JSON mode and returns a `SearchFilters` shape (`title_contains`, `genres`, `languages`, `min_rating`) matching the existing filter state in `Movies.jsx`. The page maps the response onto `setSelectedGenres` / `setSelectedLanguages` / `setMinRating` / `setSearchTerm` — no separate "voice filters" state. Filter chips render only for genres/languages **present in the loaded catalog**; if the LLM names one that does not exist in the data, the predicate still applies (and nothing matches) but no chip appears. Edit the `SYSTEM_PROMPT` in `BN/search.py` when you add new genre/language vocabulary so the model knows the canonical strings.

### AI Summariser: DeepSeek over OpenAI-compatible API
`BN/summariser.py` calls DeepSeek via the `openai` SDK pointed at `https://api.deepseek.com/v1` (model `deepseek-chat`). `POST /movies/{id}/summarise` is login-gated, streams the response as `text/plain`, and caches the final text in `movies.ai_summary` so subsequent calls replay the cache as a single chunk (the frontend doesn't need to distinguish). The frontend reader (`api.streamSummary` in `FN/src/api.js`) is an async generator that yields decoded chunks; the `Summariser` page appends them to state as they arrive. Set `DEEPSEEK_API_KEY` in `BN/.env` / Railway — the endpoint returns an inline error chunk if it is missing rather than failing the request.

### Storage: Cloudflare R2
`BN/storage.py` talks to R2 via boto3 (S3-compatible). `POST /uploads/poster` is admin-only, enforces a 5 MB cap and a fixed list of `image/{jpeg,png,webp}` content types, generates a UUID-based key under `posters/`, and returns `{ url, key }`. The frontend uses the returned URL as `poster_url` when creating/updating a movie. R2 envs are all required (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`); the route returns 503 if any are missing rather than crashing on startup.

### Environment variables — what is read where

Backend (`BN/.env`, or Railway Variables):
- `SUPABASE_URL`, `SUPABASE_KEY` (service_role) — required, read in `database.py`
- `ALLOWED_ORIGINS` — comma-separated, or `*`. Read in `main.py` for CORS.
- `R2_*` — required only if `/uploads/poster` is used.
- `DEEPSEEK_API_KEY` — required only if `/movies/{id}/summarise`, `/chat`, `/chat/rag`, or `/search/parse` is used.
- `JINA_API_KEY` — required for the RAG feature (`/rag/documents`, `/chat/rag`).
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` — optional. When set, all LLM calls are traced, prompts are fetched from Langfuse, and `/traces/{id}/score` accepts thumbs feedback. When unset, the app falls back to hardcoded prompts in `BN/observability.py` and tracing/scoring become no-ops.

Frontend (`FN/.env`, or Vercel env vars):
- `VITE_API_URL` — required, the backend's base URL.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — optional; Google sign-in is hidden when unset.

After deploying the frontend, **add the Vercel URL to Railway's `ALLOWED_ORIGINS`** or CORS will block real requests (you'll see them succeed only from `localhost`).
