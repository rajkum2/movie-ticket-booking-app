# Frontend (FN) — Movie Ticket Booking

React (Vite) single-page app. Flow: **Movies → Seat selection → Payment (dummy) → Confirmation**, plus an **Admin** button in the header that lists all bookings.

## Run locally

```bash
cd FN
npm install
cp .env.example .env      # set VITE_API_URL to your backend URL
npm run dev
```

Opens at http://localhost:5173. Make sure the backend (BN) is running and that
`VITE_API_URL` points at it (default `http://localhost:8000`).

## Deploy to Vercel

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com): **Add New → Project** and import the repo.
3. Set the **Root Directory** to `FN`.
4. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output `dist`.
5. Add environment variable:
   - `VITE_API_URL` = your Railway backend URL, e.g. `https://your-api.up.railway.app`
6. Deploy. After deploying, add the Vercel URL to the backend's `ALLOWED_ORIGINS`.

`vercel.json` includes an SPA rewrite so client-side routes (`/admin`, `/payment`, …) work on refresh.

## Pages

- `/` — movie grid
- `/seats/:movieId` — pick showtime + seats
- `/payment` — customer details + dummy card form
- `/confirmation` — success ticket
- `/admin` — all bookings table with totals
