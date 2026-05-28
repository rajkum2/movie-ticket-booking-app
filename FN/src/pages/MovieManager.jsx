import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMovies, createMovie, updateMovie, deleteMovie, uploadPoster } from "../api";

export default function MovieManager() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingMovie, setEditingMovie] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handlePosterFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { url } = await uploadPoster(file);
      setFormData((prev) => ({ ...prev, poster_url: url }));
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    poster_url: "",
    trailer_url: "",
    genre: "",
    language: "",
    duration_minutes: "",
    rating: "",
    price: "",
    showtimes: '["10:00 AM", "02:00 PM", "07:00 PM"]',
  });

  const loadMovies = () => {
    setLoading(true);
    getMovies()
      .then(setMovies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMovies();
  }, []);

  const openAddForm = () => {
    setEditingMovie(null);
    setFormData({
      title: "",
      description: "",
      poster_url: "",
      backdrop_url: "",
      trailer_url: "",
      genre: "",
      language: "",
      duration_minutes: "",
      rating: "",
      price: "",
      showtimes: '["10:00 AM", "02:00 PM", "07:00 PM"]',
    });
    setShowForm(true);
  };

  const openEditForm = (movie) => {
    setEditingMovie(movie);
    setFormData({
      title: movie.title,
      description: movie.description || "",
      poster_url: movie.poster_url || "",
      backdrop_url: movie.backdrop_url || "",
      trailer_url: movie.trailer_url || "",
      genre: movie.genre || "",
      language: movie.language || "",
      duration_minutes: movie.duration_minutes || "",
      rating: movie.rating || "",
      price: movie.price || "",
      showtimes: JSON.stringify(movie.showtimes || ["10:00 AM", "02:00 PM", "07:00 PM"]),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingMovie(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    let parsedShowtimes;
    try {
      parsedShowtimes = JSON.parse(formData.showtimes);
    } catch {
      setError("Showtimes must be valid JSON array, e.g. [\"10:00 AM\", \"02:00 PM\"]");
      return;
    }

    const payload = {
      title: formData.title,
      description: formData.description,
      poster_url: formData.poster_url,
      backdrop_url: formData.backdrop_url || null,
      trailer_url: formData.trailer_url || null,
      genre: formData.genre,
      language: formData.language,
      duration_minutes: parseInt(formData.duration_minutes) || null,
      rating: parseFloat(formData.rating) || null,
      price: parseFloat(formData.price),
      showtimes: parsedShowtimes,
    };

    try {
      if (editingMovie) {
        await updateMovie(editingMovie.id, payload);
      } else {
        await createMovie(payload);
      }
      closeForm();
      loadMovies();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (movie) => {
    if (!window.confirm(`Delete "${movie.title}"? This cannot be undone.`)) return;

    try {
      await deleteMovie(movie.id);
      loadMovies();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleQuickPriceChange = async (movie, newPrice) => {
    try {
      await updateMovie(movie.id, { ...movie, price: parseFloat(newPrice) });
      loadMovies();
    } catch (e) {
      alert("Failed to update price: " + e.message);
    }
  };

  return (
    <div className="movie-manager">
      <div className="manager-header">
        <button className="link-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1 className="page-title">Movie Manager</h1>
        <button className="primary-btn" onClick={openAddForm}>
          + Add New Movie
        </button>
      </div>

      {error && <p className="status error">⚠️ {error}</p>}

      {loading ? (
        <p className="status">Loading movies…</p>
      ) : (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>Poster</th>
                <th>Title</th>
                <th>Genre</th>
                <th>Language</th>
                <th>Duration</th>
                <th>Rating</th>
                <th>Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {movies.map((movie) => (
                <tr key={movie.id}>
                  <td>
                    {movie.poster_url ? (
                      <img
                        src={movie.poster_url}
                        alt={movie.title}
                        style={{ width: 50, height: 70, objectFit: "cover", borderRadius: 4 }}
                      />
                    ) : (
                      <div style={{ width: 50, height: 70, background: "#333" }} />
                    )}
                  </td>
                  <td><strong>{movie.title}</strong></td>
                  <td>{movie.genre}</td>
                  <td>{movie.language}</td>
                  <td>{movie.duration_minutes} min</td>
                  <td>{movie.rating}</td>
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      defaultValue={movie.price}
                      onBlur={(e) => {
                        if (parseFloat(e.target.value) !== movie.price) {
                          handleQuickPriceChange(movie, e.target.value);
                        }
                      }}
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <button
                      className="primary-btn small"
                      onClick={() => openEditForm(movie)}
                    >
                      Edit
                    </button>
                    <button
                      className="admin-btn"
                      style={{ marginLeft: 8 }}
                      onClick={() => handleDelete(movie)}
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

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingMovie ? "Edit Movie" : "Add New Movie"}</h2>

            <form onSubmit={handleSubmit} className="movie-form">
              <div className="form-grid">
                <label>
                  Title
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </label>

                <label>
                  Price ($)
                  <input
                    type="number"
                    step="0.5"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                  />
                </label>

                <div className="poster-field" style={{ gridColumn: "1 / -1" }}>
                  <label>
                    Poster image (upload)
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
                      type="text"
                      value={formData.poster_url}
                      onChange={(e) =>
                        setFormData({ ...formData, poster_url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                  </label>
                  {uploading && <p className="status">Uploading…</p>}
                  {uploadError && (
                    <p className="status error">⚠️ {uploadError}</p>
                  )}
                  {!uploading && formData.poster_url && (
                    <div className="poster-preview">
                      <img src={formData.poster_url} alt="Poster preview" />
                    </div>
                  )}
                </div>

                <label style={{ gridColumn: "1 / -1" }}>
                  Trailer URL (YouTube)
                  <input
                    type="url"
                    value={formData.trailer_url}
                    onChange={(e) =>
                      setFormData({ ...formData, trailer_url: e.target.value })
                    }
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </label>

                <label style={{ gridColumn: "1 / -1" }}>
                  Landscape backdrop URL (16:9)
                  <input
                    type="url"
                    value={formData.backdrop_url}
                    onChange={(e) =>
                      setFormData({ ...formData, backdrop_url: e.target.value })
                    }
                    placeholder="https://image.tmdb.org/t/p/w1280/..."
                  />
                </label>

                <label>
                  Genre
                  <input
                    type="text"
                    value={formData.genre}
                    onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                  />
                </label>

                <label>
                  Language
                  <input
                    type="text"
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  />
                </label>

                <label>
                  Duration (minutes)
                  <input
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                  />
                </label>

                <label>
                  Rating
                  <input
                    type="number"
                    step="0.1"
                    value={formData.rating}
                    onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                  />
                </label>

                <label style={{ gridColumn: "1 / -1" }}>
                  Showtimes (JSON array)
                  <input
                    type="text"
                    value={formData.showtimes}
                    onChange={(e) => setFormData({ ...formData, showtimes: e.target.value })}
                  />
                </label>

                <label style={{ gridColumn: "1 / -1" }}>
                  Description
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button type="button" className="admin-btn" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  {editingMovie ? "Save Changes" : "Add Movie"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
