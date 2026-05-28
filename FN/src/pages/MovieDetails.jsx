import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMovie } from "../api";
import { useAuth } from "../auth.jsx";
import { youtubeEmbedUrl } from "../utils/youtube";

export default function MovieDetails() {
  const { movieId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setLoading(true);
    getMovie(movieId)
      .then(setMovie)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [movieId]);

  const handleBook = () => {
    if (!user) {
      navigate("/login", { state: { from: { pathname: `/seats/${movieId}` } } });
    } else {
      navigate(`/seats/${movieId}`);
    }
  };

  if (loading) return <p className="status">Loading…</p>;
  if (error) return <p className="status error">⚠️ {error}</p>;
  if (!movie) return <p className="status">Movie not found.</p>;

  const embed = youtubeEmbedUrl(movie.trailer_url);
  const meta = [
    movie.genre,
    movie.language,
    movie.duration_minutes && `${movie.duration_minutes} min`,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <section className="movie-details">
      <button className="link-btn" onClick={() => navigate("/")}>
        ← Back to movies
      </button>

      <div className="details-layout">
        <div className="details-poster">
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} />
          ) : (
            <div className="poster-placeholder">{movie.title}</div>
          )}
        </div>

        <div className="details-body">
          <h1 className="details-title">{movie.title}</h1>
          {meta && <p className="meta">{meta}</p>}
          <div className="details-row">
            {movie.rating != null && (
              <span className="rating-pill">★ {movie.rating} / 10</span>
            )}
            <span className="price-pill">
              ${Number(movie.price).toFixed(2)} / seat
            </span>
          </div>

          {movie.description && (
            <>
              <h3>Synopsis</h3>
              <p className="details-description">{movie.description}</p>
            </>
          )}

          {movie.showtimes?.length > 0 && (
            <>
              <h3>Showtimes</h3>
              <div className="showtime-row">
                {movie.showtimes.map((st) => (
                  <span key={st} className="chip">
                    {st}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="details-cta">
            <button className="primary-btn" onClick={handleBook}>
              Book Now
            </button>
            {movie.trailer_url && !embed && (
              <a
                className="link-btn"
                href={movie.trailer_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                ▶ Watch trailer
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Trailer */}
      <div className="trailer-section">
        <h2>Trailer</h2>
        {!movie.trailer_url && (
          <p className="status">No trailer available for this movie.</p>
        )}
        {movie.trailer_url && !embed && (
          <p className="status">
            Trailer link is not embeddable.{" "}
            <a href={movie.trailer_url} target="_blank" rel="noopener noreferrer">
              Open it in a new tab
            </a>
            .
          </p>
        )}
        {embed && (
          <div className="trailer-wrap">
            {!playing ? (
              <button
                className="trailer-poster"
                onClick={() => setPlaying(true)}
                aria-label="Play trailer"
              >
                {movie.poster_url ? (
                  <img src={movie.poster_url} alt="" />
                ) : (
                  <div className="poster-placeholder">{movie.title}</div>
                )}
                <span className="play-overlay">▶</span>
              </button>
            ) : (
              <iframe
                className="trailer-iframe"
                src={`${embed}?autoplay=1&rel=0`}
                title={`${movie.title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
