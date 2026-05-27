// Thin wrapper around the backend API.
// The base URL comes from VITE_API_URL (set in .env / Vercel env vars).
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const getMovies = () => request("/movies");

export const getMovie = (id) => request(`/movies/${id}`);

export const getSeatAvailability = (movieId, showtime) =>
  request(`/movies/${movieId}/seats?showtime=${encodeURIComponent(showtime)}`);

export const createBooking = (payload) =>
  request("/bookings", { method: "POST", body: JSON.stringify(payload) });

export const getBookings = () => request("/bookings");
