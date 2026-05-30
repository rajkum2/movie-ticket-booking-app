// Thin wrapper around the backend API.
// The base URL comes from VITE_API_URL (set in .env / Vercel env vars).
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);

const TOKEN_KEY = "cinebook.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---- Auth ----
export const login = (email, password) =>
  request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const register = (payload) =>
  request("/auth/register", { method: "POST", body: JSON.stringify(payload) });

export const googleExchange = (access_token) =>
  request("/auth/google", {
    method: "POST",
    body: JSON.stringify({ access_token }),
  });

export const logout = () => request("/auth/logout", { method: "POST" });

export const me = () => request("/auth/me");

// ---- Movies ----
export const getMovies = () => request("/movies");
export const getMovie = (id) => request(`/movies/${id}`);
export const createMovie = (payload) =>
  request("/movies", { method: "POST", body: JSON.stringify(payload) });
export const updateMovie = (id, payload) =>
  request(`/movies/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteMovie = (id) =>
  request(`/movies/${id}`, { method: "DELETE" });

// ---- Seats / bookings ----
export const getSeatAvailability = (movieId, showtime) =>
  request(`/movies/${movieId}/seats?showtime=${encodeURIComponent(showtime)}`);

export const createBooking = (payload) =>
  request("/bookings", { method: "POST", body: JSON.stringify(payload) });

export const getBookings = () => request("/bookings");
export const getMyBookings = () => request("/bookings/me");

// ---- Uploads (admin) ----
export async function uploadPoster(file) {
  const token = getToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/uploads/poster`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json(); // { url, key }
}

// ---- RAG knowledge base (admin) ----
export const listDocuments = () => request("/rag/documents");
export const deleteDocument = (id) =>
  request(`/rag/documents/${id}`, { method: "DELETE" });

export async function uploadDocument({ title, text, file }) {
  const token = getToken();
  const fd = new FormData();
  fd.append("title", title);
  if (text) fd.append("text", text);
  if (file) fd.append("file", file);
  const res = await fetch(`${API_URL}/rag/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// NDJSON streaming RAG chat — yields { type: "sources"|"delta"|"done", ... }
export async function* streamRagChat(messages) {
  const token = getToken();
  const res = await fetch(`${API_URL}/chat/rag`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line);
      } catch {
        /* skip malformed lines */
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      yield JSON.parse(tail);
    } catch {
      /* ignore */
    }
  }
}

// ---- AI Chat ----
// messages is an array of { role: "user" | "assistant", content: string }
export async function* streamChat(messages) {
  const token = getToken();
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) yield chunk;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

// ---- Natural-language search ----
// Returns { title_contains?, genres?, languages?, min_rating? }
export const parseSearchQuery = (query) =>
  request("/search/parse", {
    method: "POST",
    body: JSON.stringify({ query }),
  });

// ---- AI Summariser ----
// Async generator that yields chunks of text from the streaming endpoint.
export async function* streamSummary(movieId) {
  const token = getToken();
  const res = await fetch(`${API_URL}/movies/${movieId}/summarise`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) yield chunk;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

// ---- Users (admin) ----
export const getUsers = () => request("/users");
export const createUser = (payload) =>
  request("/users", { method: "POST", body: JSON.stringify(payload) });
export const updateUser = (id, payload) =>
  request(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteUser = (id) =>
  request(`/users/${id}`, { method: "DELETE" });
