# Backend (BN) — Movie Ticket Booking API

FastAPI service backed by Supabase (Postgres). No authentication. Dummy payments.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of [`schema.sql`](./schema.sql), and run it. This creates the `movies` and `bookings` tables and seeds 4 classic sample movies.
3. (Optional but recommended) To load **115+ diverse movies** (great for demoing the search & filters), also run [`seed-movies.sql`](./seed-movies.sql) in the SQL Editor.
4. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **`service_role` key** (under "Project API keys") → `SUPABASE_KEY`

## 2. Run locally

```bash
cd BN
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then fill in SUPABASE_URL and SUPABASE_KEY
uvicorn main:app --reload
```

API runs at http://localhost:8000 — interactive docs at http://localhost:8000/docs

## 3. Deploy to Railway

1. Push this repo to GitHub.
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**.
3. Set the **Root Directory** to `BN` (Settings → Source).
4. Add environment variables (Variables tab):
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `ALLOWED_ORIGINS` = your Vercel URL, e.g. `https://your-app.vercel.app`
5. Railway auto-detects Python and starts it with the command in `railway.json` / `Procfile`. It injects `$PORT` automatically.
6. Copy the generated public URL — you'll give it to the frontend as `VITE_API_URL`.

## Endpoints

| Method | Path                       | Purpose                                  |
|--------|----------------------------|------------------------------------------|
| GET    | `/`                        | Health check                             |
| GET    | `/movies`                  | List all movies                          |
| GET    | `/movies/{id}`             | Single movie                             |
| GET    | `/movies/{id}/seats?showtime=` | Booked seats for a movie + showtime  |
| POST   | `/bookings`                | Create a booking (always "PAID")         |
| GET    | `/bookings`                | List all bookings (admin view)           |

`POST /bookings` body:

```json
{
  "movie_id": 1,
  "showtime": "06:00 PM",
  "customer_name": "Jane Doe",
  "customer_email": "jane@example.com",
  "seats": ["A1", "A2"]
}
```
