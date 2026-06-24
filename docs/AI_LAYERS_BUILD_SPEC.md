# CineBook AI Layers — Build Spec

A complete, build-ready description of the AI capability layers in this repo,
written so it can be handed to **Claude Code** to implement the remaining work.

Each section marks **STATUS**:
- `EXISTS` — already built; described so new code matches the pattern.
- `BUILD` — the work to do, with file paths, signatures, and acceptance criteria.

> Companion visuals: the Excalidraw capability map, per-layer flow diagrams, and
> the layer comparison table.

---

## 0. Shared conventions (read first)

These patterns are used everywhere — new code MUST follow them.

- **Stack:** FastAPI backend (`BN/`), Supabase/Postgres via `supabase-py`
  (service-role key, server-side), React + Vite frontend (`FN/`). The two halves
  talk over HTTP only (`VITE_API_URL`).
- **LLM:** DeepSeek via the OpenAI-compatible SDK. Import the client with
  `from summariser import get_deepseek_client, DEEPSEEK_MODEL`. For streaming
  completions reuse `chat.stream_completion(messages, temperature, langfuse_prompt)`.
- **Auth:** every protected route uses `user: dict = Depends(get_current_user)`;
  admin-only uses `Depends(require_admin)`. Never trust a user id from request
  args — derive it from `user["id"]`.
- **Prompts live in Langfuse**, not in code. Fetch with
  `system_text, prompt_obj = observability.get_prompt("<name>")` and pass
  `langfuse_prompt=prompt_obj` to the completion. Add the default text to
  `DEFAULT_PROMPTS` in `observability.py` so `seed_prompts()` creates it on
  startup.
- **Streaming protocols:**
  - Plain text stream (`text/plain`) for Layer 1 + plain chat.
  - **NDJSON** (`application/x-ndjson`, one JSON object per line) for RAG and
    agent chats. Always end with `{"type":"done"}`. Expose the trace id via the
    `X-Trace-Id` response header (CORS already lists it in `expose_headers`).
- **Feature flags:** experimental capabilities are gated by rows in
  `feature_flags` and the `KNOWN_FLAGS` list in `featureflags.py`. Check with
  `featureflags.is_enabled("<key>")`; return `403` when off.
- **Tracing:** wrap each streaming generator in
  `observability.TraceContext(name=..., user_id=..., tags=[...], metadata={...})`.

---

## 1. Layer 1 — AI Summariser   `STATUS: EXISTS`

**What it is:** pure prompting. The model gets only the movie title (general
knowledge) — no retrieval, no tools.

- **Endpoint:** `POST /movies/{movie_id}/summarise` (login-gated), `main.py`.
- **Module:** `summariser.py` → `stream_summary(title)`.
- **Behavior:** fetch movie row; if `movies.ai_summary` is non-empty, replay it
  as a single chunk (no LLM call, empty `X-Trace-Id`); else stream DeepSeek
  deltas as `text/plain` and cache the result back to `movies.ai_summary`.
- **Prompt:** Langfuse `summariser-system`.
- **Frontend:** `api.startSummary(movieId)` → async generator of text chunks.

No work required. Use it as the reference for the plain-text streaming + cache
pattern.

---

## 2. Layer 2 — RAG Chat   `STATUS: EXISTS`

**What it is:** augmented retrieval. Answers grounded in admin-uploaded docs,
with citations.

- **Endpoint:** `POST /chat/rag` (login-gated), `main.py`. Body: `ChatRequest`
  (`messages: [{role, content}]`, last must be `user`; ≤40 msgs, ≤4000 chars).
- **Module:** `rag.py` — `reformulate_query(messages)` → `retrieve(query, k=5,
  threshold=0.4)` (calls Postgres `match_rag_chunks` via `sb.rpc`) →
  `build_rag_system_prompt(chunks)`.
- **Embeddings:** Jina `jina-embeddings-v3`, 1024-dim, stored in `rag_chunks`
  (pgvector). Ingestion in `rag.ingest_document(...)`, chunk 800/overlap 120.
- **NDJSON events:** `{"type":"sources", sources:[...]}` then many
  `{"type":"delta", content}` then `{"type":"done"}`.
- **Prompts:** Langfuse `rag-grounding-preamble`, `rag-query-reformulator`.
- **Frontend:** `api.startRagChat(messages)` → `{traceId, stream}`; `Chat.jsx`
  handles `sources`/`delta` and renders a Sources list.

No work required. This is the template for the NDJSON + sources pattern.

---

## 3. Layer 3a — Agentic Chat (read-only)   `STATUS: EXISTS`

**What it is:** a ReAct tool-calling loop over **read-only** tools.

- **Endpoint:** `POST /chat/agent` (login-gated **and** gated by feature flag
  `tools`; returns 403 when off), `main.py`.
- **Module:** `agent.py` → `stream_agent_chat(messages, user)`.
- **Tools (read-only):** `search_movies`, `get_movie_details`, `get_showtimes`,
  `get_seat_availability`, `get_my_bookings` (scoped to `user["id"]`, never from
  args), `current_datetime`. Each backed by the same Supabase queries the REST
  endpoints use.
- **Loop:** up to `MAX_ITERATIONS = 5`; emits `{"type":"tool_call",name,args}`,
  `{"type":"tool_result",name,summary}`, `{"type":"delta",content}`,
  `{"type":"done"}`.
- **Prompt:** Langfuse `agent-system`.
- **Frontend:** `api.startAgentChat(messages)`; `Chat.jsx` renders tool_call /
  tool_result / delta.
- **Guardrails:** read-only (no writes/deletes), iteration cap, user-scoped
  bookings, feature-flag gated.

No work required. The new layer below **extends this pattern**.

---

## 4. Layer 3b — AI Chat Advanced (action-taking agent)   `STATUS: BUILD`

**Goal:** let the agent complete a whole booking workflow end to end — search →
showtimes → seat availability → **create a booking** — but route every
*consequential (write) action* through an explicit **human approval** step. No
money moves and no row is written without the user clicking "Confirm".

### 4.1 Design (stateless, two-phase)

Chat is stateless per request (the agent rebuilds the conversation from
`messages`). Keep it that way. Split a write into **propose** then **execute**:

1. **Propose (LLM in the loop).** The agent runs the read-only loop as today.
   When it decides a booking should happen, it does **not** write. It emits a
   new NDJSON event and stops:
   ```json
   {"type":"confirm_request","action":"create_booking",
    "args":{"movie_id":12,"showtime":"09:00 PM","seats":["A1","A2"]},
    "summary":"Book 2 seats (A1, A2) for Interstellar at 09:00 PM — total $24.00"}
   ```
2. **Execute (no LLM).** The user clicks Confirm. The frontend calls a separate
   endpoint that re-validates and performs the write deterministically (reusing
   the exact `/bookings` guardrails). The LLM is **not** what triggers the write
   — it only proposes; server code executes. This is the key safety property.
3. Optionally feed the confirmed result back as one more agent turn so CineBot
   can write a natural closing message ("You're booked — confirmation #123").

> Why not let a write tool run inside the loop? Because then the model's output
> directly causes a state change. The propose/execute split keeps a human and
> deterministic server code between the model and the database.

### 4.2 Backend changes

**New feature flag** — `featureflags.py`, add to `KNOWN_FLAGS`:
```python
{"key": "tools_write", "label": "Agent actions (booking)",
 "description": "Let CineBot propose bookings; writes still require explicit "
                "user confirmation.", "default": False}
```

**New module** `BN/agent_advanced.py` (or extend `agent.py`):
- Reuse the read-only `TOOLS` + `DISPATCH` from `agent.py`.
- Add **proposal tools** the model can call (these do NOT write — they validate
  and return a proposal the server turns into a `confirm_request`):
  - `propose_booking(movie_id: int, showtime: str, seats: list[str])` — validates
    the showtime exists, computes `total = price * len(seats)`, runs the
    seat-clash read, and returns `{ok, summary, args}` or `{error}`. On `ok`, the
    loop emits `confirm_request` and returns (pauses).
  - `propose_cancellation(booking_id: int)` — verifies the booking belongs to
    `user["id"]`, returns a summary; emits `confirm_request` with
    `action:"cancel_booking"`.
- System prompt: Langfuse `agent-advanced-system` (add default to
  `DEFAULT_PROMPTS`). It must instruct: gather details with read tools first;
  call a `propose_*` tool only when you have everything; never claim a booking is
  done until after confirmation.

**New service functions** (pure, reusable — put in a small `bookings_service.py`
or inside `agent_advanced.py`):
```python
def execute_create_booking(user, movie_id, showtime, seats) -> dict
    # mirrors POST /bookings: 404 if movie missing, 400 if showtime invalid,
    # 409 on seat clash, total = price*len(seats), payment_status="PAID",
    # user_id = user["id"]. Returns the booking row (+ movie_title).
def execute_cancel_booking(user, booking_id) -> dict
    # 404 if not found, 403 if booking.user_id != user["id"], else delete/mark
    # cancelled. (No cancel path exists today — add one.)
```
Refactor `POST /bookings` to call `execute_create_booking` so the route and the
agent share one code path (single source of truth for the seat-clash + total
logic).

**New endpoints** in `main.py`:
- `POST /chat/agent/advanced` — like `/chat/agent` but gated by `tools_write`,
  uses `agent_advanced.stream_agent_chat`, and can emit `confirm_request`.
- `POST /chat/agent/execute` — login-gated + `tools_write`. Body:
  `{action: "create_booking"|"cancel_booking", args: {...}}`. Re-validates and
  calls the matching `execute_*` function. Returns the booking (or 4xx). This is
  the only place a write happens. Wrap in a `TraceContext(name="agent-execute")`.

**Models** — add to `models.py`:
```python
class AgentAction(BaseModel):
    action: Literal["create_booking", "cancel_booking"]
    args: dict
```

### 4.3 Database changes (`BN/schema.sql`, idempotent)

- Add a **unique constraint to close the seat-clash race** (CLAUDE.md flags the
  current check is non-transactional). Normalize seats to one row per seat, or
  add a guard table; minimum viable:
  ```sql
  -- prevents double-booking even under concurrent requests
  create table if not exists booking_seats (
      movie_id  bigint not null,
      showtime  text   not null,
      seat      text   not null,
      booking_id bigint not null references bookings(id) on delete cascade,
      primary key (movie_id, showtime, seat)
  );
  ```
  `execute_create_booking` inserts into `booking_seats` inside the same logical
  step and relies on the PK to reject clashes (catch the unique-violation → 409).
- Cancellation: either `delete from bookings where id=... and user_id=...` or add
  a `status text default 'CONFIRMED'` column and set `'CANCELLED'`. Pick delete
  for simplicity unless history matters.

### 4.4 Frontend changes (`FN/`)

- `api.js`: add `startAdvancedAgentChat(messages)` (same NDJSON reader as
  `startAgentChat`, new path) and `executeAgentAction(action, args)` (plain
  `request("/chat/agent/execute", {method:"POST", body:...})`).
- `Chat.jsx`:
  - Add a mode toggle (or reuse the existing tools toggle) that routes to the
    advanced endpoint when `tools_write` is on.
  - Handle the new `confirm_request` event: render a **confirmation card**
    (summary + Confirm / Cancel buttons). On **Confirm**, call
    `executeAgentAction(...)`, show the result, and (optional) post a follow-up
    turn so CineBot closes the loop. On **Cancel**, send nothing / show "cancelled".
  - Reuse the existing `tool_call` / `tool_result` / `delta` rendering.

### 4.5 Guardrails (must all hold)

- The LLM can only **propose**; `/chat/agent/execute` is the sole writer and
  re-validates everything server-side.
- Human confirmation is required before any write (`confirm_request` → user
  click → execute).
- Booking/cancel are **auth-scoped**: `user_id` from session, ownership checked
  on cancel.
- Seat-clash enforced at the DB (unique constraint), not just the read check.
- Feature-flag gated (`tools_write`); off by default; 403 when off.
- `MAX_ITERATIONS` cap retained. Never auto-charge — payment stays a confirmed,
  explicit step.

### 4.6 Acceptance criteria

1. With `tools_write` off, `/chat/agent/advanced` and `/chat/agent/execute`
   return 403.
2. "Book 2 seats for the 9pm show of <movie>" produces a `confirm_request` with
   correct seats, showtime, and total — and **no** DB write yet.
3. Confirming creates exactly one booking owned by the session user; the seats
   then show as taken via `get_seat_availability`.
4. Two concurrent confirmations for the same seat: exactly one succeeds, the
   other gets 409.
5. Cancelling another user's booking returns 403.
6. All four streams still end with `{"type":"done"}` and set `X-Trace-Id`.
7. `POST /bookings` and the agent share `execute_create_booking` (no duplicated
   seat-clash logic).

### 4.7 Task checklist (ordered, for Claude Code)

1. Add `tools_write` flag to `KNOWN_FLAGS`.
2. Add `agent-advanced-system` default prompt to `observability.DEFAULT_PROMPTS`.
3. Create `booking_seats` table + 409-on-unique-violation in schema/services.
4. Write `execute_create_booking` / `execute_cancel_booking`; refactor
   `POST /bookings` to use the former.
5. Build `agent_advanced.py` (read tools + `propose_booking` /
   `propose_cancellation`, emits `confirm_request`).
6. Add `POST /chat/agent/advanced` and `POST /chat/agent/execute` routes.
7. Add `AgentAction` model.
8. Frontend: `startAdvancedAgentChat`, `executeAgentAction`, confirmation card in
   `Chat.jsx`.
9. Test against §4.6 acceptance criteria.

---

## 5. Optional "Advanced+" enhancements   `STATUS: BACKLOG`

Only after §4 is solid:
- **RAG-grounded agent:** expose retrieval as a tool (`search_help_docs`) so the
  agent answers refund/FAQ questions from the knowledge base mid-workflow.
- **Multi-step memory:** summarize long tool histories to stay under context
  limits.
- **More actions:** seat change, re-book, email receipt — each behind the same
  propose/execute + confirm pattern.

---

## 6. Environment variables (already wired)

Backend: `SUPABASE_URL`, `SUPABASE_KEY`, `ALLOWED_ORIGINS`, `DEEPSEEK_API_KEY`
(all chat/agent/summarise), `JINA_API_KEY` (RAG), optional `LANGFUSE_*`.
Frontend: `VITE_API_URL` (+ optional `VITE_SUPABASE_*` for Google sign-in).
No new env vars are required for Layer 3b.

---

## 7. Quick demo prompts (per layer)

- **L1:** open a movie → "Summarise".
- **L2 (RAG):** "What's our refund policy?" (after uploading a policy doc).
- **L3a (read agent, flag `tools`):** "What's playing tonight after 8pm in
  English, and which seats are free for the 9pm show?"
- **L3b (advanced, flag `tools_write`):** "Book me 2 seats for the 9pm show of
  Interstellar." → confirm card → booked.
