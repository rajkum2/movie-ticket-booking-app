import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMovies } from "../api";

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMovies()
      .then(setMovies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredMovies = searchTerm.trim()
    ? movies.filter((m) =>
        m.title.toLowerCase().includes(searchTerm.trim().toLowerCase())
      )
    : movies;

  const clearSearch = () => setSearchTerm("");

  if (loading) return <p className="status">Loading movies…</p>;
  if (error) return <p className="status error">⚠️ {error}</p>;
  if (movies.length === 0) return <p className="status">No movies available.</p>;

  return (
    <section>
      <h1 className="page-title">Now Showing</h1>

      {/* Search box */}
      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search movies by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search movies"
        />
        {searchTerm && (
          <button
            type="button"
            className="search-clear"
            onClick={clearSearch}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {filteredMovies.length === 0 ? (
        <p className="status">
          No movies match “{searchTerm.trim()}”.
          <button className="link-btn" onClick={clearSearch} style={{ marginLeft: 8 }}>
            Clear search
          </button>
        </p>
      ) : (
        <div className="movie-grid">
          {filteredMovies.map((m) => (
            <article
              key={m.id}
              className="movie-card"
              onClick={() => navigate(`/seats/${m.id}`)}
            >
              <div className="poster">
                {m.poster_url ? (
                  <img src={m.poster_url} alt={m.title} loading="lazy" />
                ) : (
                  <div className="poster-placeholder">{m.title}</div>
                )}
                {m.rating != null && <span className="rating">★ {m.rating}</span>}
              </div>
              <div className="movie-info">
                <h3>{m.title}</h3>
                <p className="meta">
                  {[m.genre, m.language, m.duration_minutes && `${m.duration_minutes} min`]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
                <p className="price">${Number(m.price).toFixed(2)} / seat</p>
                <button className="primary-btn small">Book Now</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
