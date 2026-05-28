import { useEffect, useState } from "react";
import {
  createMovie,
  deleteMovie,
  getMovies,
  updateMovie,
  uploadPoster,
} from "../../api";

const EMPTY = {
  title: "",
  description: "",
  poster_url: "",
  trailer_url: "",
  genre: "",
  language: "",
  duration_minutes: "",
  rating: "",
  price: "",
  showtimes: "",
};

function toPayload(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    poster_url: form.poster_url.trim() || null,
    trailer_url: form.trailer_url.trim() || null,
    genre: form.genre.trim() || null,
    language: form.language.trim() || null,
    duration_minutes: form.duration_minutes
      ? Number(form.duration_minutes)
      : null,
    rating: form.rating ? Number(form.rating) : null,
    price: Number(form.price),
    showtimes: form.showtimes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function fromMovie(m) {
  return {
    title: m.title || "",
    description: m.description || "",
    poster_url: m.poster_url || "",
    trailer_url: m.trailer_url || "",
    genre: m.genre || "",
    language: m.language || "",
    duration_minutes: m.duration_minutes ?? "",
    rating: m.rating ?? "",
    price: m.price ?? "",
    showtimes: (m.showtimes || []).join(", "),
  };
}

export default function MoviesTab() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null); // null | "new" | movie object
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handlePosterFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const { url } = await uploadPoster(file);
      setForm((prev) => ({ ...prev, poster_url: url }));
    } catch (err) {
      setFormError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError(null);
    getMovies()
      .then(setMovies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startNew = () => {
    setEditing("new");
    setForm(EMPTY);
    setFormError(null);
  };
  const startEdit = (m) => {
    setEditing(m);
    setForm(fromMovie(m));
    setFormError(null);
  };
  const cancel = () => {
    setEditing(null);
    setFormError(null);
  };

  const onChange = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const payload = toPayload(form);
      if (editing === "new") {
        await createMovie(payload);
      } else {
        await updateMovie(editing.id, payload);
      }
      cancel();
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (m) => {
    if (!confirm(`Delete "${m.title}"? Bookings for this movie will be removed.`))
      return;
    try {
      await deleteMovie(m.id);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="admin-head">
        <h2>Movies</h2>
        <div className="row-gap">
          <button className="link-btn" onClick={load}>
            Refresh
          </button>
          <button className="primary-btn small" onClick={startNew}>
            + Add movie
          </button>
        </div>
      </div>

      {loading && <p className="status">Loading…</p>}
      {error && <p className="status error">⚠️ {error}</p>}

      {!loading && !error && movies.length === 0 && (
        <p className="status">No movies yet.</p>
      )}

      {!loading && !error && movies.length > 0 && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Genre</th>
                <th>Lang</th>
                <th>Duration</th>
                <th>Rating</th>
                <th>Price</th>
                <th>Showtimes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movies.map((m) => (
                <tr key={m.id}>
                  <td>#{m.id}</td>
                  <td>{m.title}</td>
                  <td>{m.genre || "—"}</td>
                  <td>{m.language || "—"}</td>
                  <td>{m.duration_minutes ? `${m.duration_minutes} min` : "—"}</td>
                  <td>{m.rating ?? "—"}</td>
                  <td>${Number(m.price).toFixed(2)}</td>
                  <td>{(m.showtimes || []).join(", ") || "—"}</td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => startEdit(m)}>
                      Edit
                    </button>
                    <button
                      className="link-btn danger"
                      onClick={() => onDelete(m)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={cancel}>
          <form
            className="card modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSave}
          >
            <h3>{editing === "new" ? "New movie" : `Edit ${editing.title}`}</h3>
            <label>
              Title
              <input
                type="text"
                value={form.title}
                onChange={onChange("title")}
                required
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={onChange("description")}
              />
            </label>
            <div className="poster-field">
              <label>
                Poster image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePosterFile}
                  disabled={uploading}
                />
              </label>
              <label>
                …or paste a URL
                <input
                  type="url"
                  value={form.poster_url}
                  onChange={onChange("poster_url")}
                  placeholder="https://…"
                />
              </label>
              {uploading && (
                <p className="status" style={{ padding: "8px 0" }}>
                  Uploading…
                </p>
              )}
              {!uploading && form.poster_url && (
                <div className="poster-preview">
                  <img src={form.poster_url} alt="Poster preview" />
                </div>
              )}
            </div>
            <label>
              Trailer URL (YouTube)
              <input
                type="url"
                value={form.trailer_url}
                onChange={onChange("trailer_url")}
                placeholder="https://www.youtube.com/watch?v=…"
              />
            </label>
            <div className="row-2">
              <label>
                Genre
                <input
                  type="text"
                  value={form.genre}
                  onChange={onChange("genre")}
                />
              </label>
              <label>
                Language
                <input
                  type="text"
                  value={form.language}
                  onChange={onChange("language")}
                />
              </label>
            </div>
            <div className="row-2">
              <label>
                Duration (min)
                <input
                  type="number"
                  min="1"
                  max="600"
                  value={form.duration_minutes}
                  onChange={onChange("duration_minutes")}
                />
              </label>
              <label>
                Rating (0–10)
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={form.rating}
                  onChange={onChange("rating")}
                />
              </label>
            </div>
            <label>
              Price per seat
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={onChange("price")}
                required
              />
            </label>
            <label>
              Showtimes (comma-separated)
              <input
                type="text"
                placeholder="10:00 AM, 02:30 PM, 07:00 PM"
                value={form.showtimes}
                onChange={onChange("showtimes")}
              />
            </label>

            {formError && <p className="status error">⚠️ {formError}</p>}

            <div className="modal-actions">
              <button type="button" className="link-btn" onClick={cancel}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary-btn small"
                disabled={busy || uploading}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
