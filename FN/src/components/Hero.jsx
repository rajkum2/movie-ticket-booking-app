import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Hero({ movie }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!movie) return null;

  const handleBook = () => {
    if (!user) {
      navigate("/login", {
        state: { from: { pathname: `/seats/${movie.id}` } },
      });
    } else {
      navigate(`/seats/${movie.id}`);
    }
  };

  const meta = [
    movie.rating != null ? `★ ${movie.rating}` : null,
    movie.genre,
    movie.language,
    movie.duration_minutes ? `${movie.duration_minutes} min` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <section
      className="nx-hero"
      style={
        movie.poster_url ? { "--hero-image": `url(${movie.poster_url})` } : {}
      }
    >
      <div className="nx-hero-fade" />
      <div className="nx-hero-content">
        <span className="nx-hero-badge">Featured</span>
        <h1 className="nx-hero-title">{movie.title}</h1>
        {meta && <p className="nx-hero-meta">{meta}</p>}
        {movie.description && (
          <p className="nx-hero-desc">{movie.description}</p>
        )}
        <div className="nx-hero-cta">
          <button className="nx-btn nx-btn-play" onClick={handleBook}>
            ▶ Book seats
          </button>
          <button
            className="nx-btn nx-btn-info"
            onClick={() => navigate(`/movies/${movie.id}`)}
          >
            ⓘ More info
          </button>
        </div>
      </div>
    </section>
  );
}
