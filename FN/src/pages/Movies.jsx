import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMovies } from "../api";

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [minRating, setMinRating] = useState(null); // null = no filter, or a number like 8
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMovies()
      .then(setMovies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Extract unique filter options from loaded movies
  const allGenres = [...new Set(movies.map((m) => m.genre).filter(Boolean))].sort();
  const allLanguages = [...new Set(movies.map((m) => m.language).filter(Boolean))].sort();

  // Combined filtering: search + genre + language + min rating
  const filteredMovies = movies.filter((m) => {
    const q = searchTerm.trim().toLowerCase();

    // Search across title, genre, and language
    const matchesSearch =
      !q ||
      m.title.toLowerCase().includes(q) ||
      (m.genre && m.genre.toLowerCase().includes(q)) ||
      (m.language && m.language.toLowerCase().includes(q));

    // Genre filter (multi-select: movie must match at least one selected)
    const matchesGenre =
      selectedGenres.length === 0 ||
      (m.genre && selectedGenres.includes(m.genre));

    // Language filter (multi-select)
    const matchesLanguage =
      selectedLanguages.length === 0 ||
      (m.language && selectedLanguages.includes(m.language));

    // Minimum rating filter
    const matchesRating =
      minRating === null || (m.rating != null && m.rating >= minRating);

    return matchesSearch && matchesGenre && matchesLanguage && matchesRating;
  });

  const clearSearch = () => setSearchTerm("");

  // Toggle helpers for multi-select filters
  const toggleGenre = (genre) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleLanguage = (lang) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const setRatingFilter = (rating) => {
    setMinRating((prev) => (prev === rating ? null : rating));
  };

  // Clear everything
  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedGenres([]);
    setSelectedLanguages([]);
    setMinRating(null);
  };

  const hasActiveFilters =
    searchTerm.trim() ||
    selectedGenres.length > 0 ||
    selectedLanguages.length > 0 ||
    minRating !== null;

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
          placeholder="Search movies..."
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

      {/* Filters */}
      {(allGenres.length > 0 || allLanguages.length > 0) && (
        <div className="filters">
          <div className="filters-header">
            <span className="filters-label">Filters</span>
            {hasActiveFilters && (
              <button className="clear-filters-btn" onClick={clearAllFilters}>
                Clear all
              </button>
            )}
          </div>

          {/* Genre chips */}
          {allGenres.length > 0 && (
            <div className="filter-group">
              <span className="filter-group-label">Genre</span>
              <div className="chip-row">
                {allGenres.map((genre) => (
                  <button
                    key={genre}
                    className={`chip ${selectedGenres.includes(genre) ? "active" : ""}`}
                    onClick={() => toggleGenre(genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Language chips */}
          {allLanguages.length > 0 && (
            <div className="filter-group">
              <span className="filter-group-label">Language</span>
              <div className="chip-row">
                {allLanguages.map((lang) => (
                  <button
                    key={lang}
                    className={`chip ${selectedLanguages.includes(lang) ? "active" : ""}`}
                    onClick={() => toggleLanguage(lang)}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Minimum Rating */}
          <div className="filter-group">
            <span className="filter-group-label">Min Rating</span>
            <div className="chip-row">
              {[null, 7, 8, 9].map((r) => (
                <button
                  key={r ?? "all"}
                  className={`chip ${minRating === r ? "active" : ""}`}
                  onClick={() => setRatingFilter(r)}
                >
                  {r === null ? "All" : `${r}+`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results summary + grid */}
      {filteredMovies.length === 0 ? (
        <p className="status">
          No movies match your current filters.
          <button className="link-btn" onClick={clearAllFilters} style={{ marginLeft: 8 }}>
            Clear filters
          </button>
        </p>
      ) : (
        <>
          {hasActiveFilters && (
            <div className="results-info">
              Showing <strong>{filteredMovies.length}</strong> of {movies.length} movies
            </div>
          )}
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
        </>
      )}
    </section>
  );
}
