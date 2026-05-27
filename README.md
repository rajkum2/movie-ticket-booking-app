# 🎬 CineBook — Movie Ticket Booking App

A full-stack movie ticket booking app. Browse movies, pick a showtime and seats,
"pay" (dummy), and get a confirmation. An **Admin** button lists every booking.
No user authentication.

```
movie-ticket-booking-app/
├── FN/   React + Vite frontend  → deploy to Vercel
└── BN/   FastAPI (Python) API    → deploy to Railway, data in Supabase
```

## Tech stack

| Layer    | Choice                          | Hosting   |
|----------|---------------------------------|-----------|
| Frontend | React 18 + Vite + React Router  | Vercel    |
| Backend  | Python + FastAPI                | Railway   |
| Database | Postgres via Supabase           | Supabase  |
| Payments | Dummy (always succeeds)         | —         |

## Quick start (local)

1. **Database** — create a Supabase project and run [`BN/schema.sql`](./BN/schema.sql) in the SQL Editor.
2. **Backend** — see [BN/README.md](./BN/README.md):
   ```bash
   cd BN && pip install -r requirements.txt
   cp .env.example .env   # add SUPABASE_URL + SUPABASE_KEY
   uvicorn main:app --reload
   ```
3. **Frontend** — see [FN/README.md](./FN/README.md):
   ```bash
   cd FN && npm install
   cp .env.example .env   # VITE_API_URL=http://localhost:8000
   npm run dev
   ```

## Deploy

1. Push to GitHub.
2. **Backend → Railway**: import repo, root dir `BN`, set `SUPABASE_URL`, `SUPABASE_KEY`, `ALLOWED_ORIGINS`.
3. **Frontend → Vercel**: import repo, root dir `FN`, set `VITE_API_URL` to the Railway URL.
4. Add the Vercel URL to Railway's `ALLOWED_ORIGINS`.

Full step-by-step instructions live in each folder's README.
