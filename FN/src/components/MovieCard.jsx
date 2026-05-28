import { useNavigate } from "react-router-dom";

export default function MovieCard({ movie, size = "md" }) {
  const navigate = useNavigate();
  return (
    <article
      className={`nx-card nx-card-${size}`}
      onClick={() => navigate(`/movies/${movie.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/movies/${movie.id}`);
      }}
    >
      <div className="nx-card-poster">
        {movie.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} loading="lazy" />
        ) : (
          <div className="poster-placeholder">{movie.title}</div>
        )}
      </div>
      <div className="nx-card-overlay">
        <h4>{movie.title}</h4>
        <p>
          {[
            movie.rating != null ? `★ ${movie.rating}` : null,
            movie.genre,
            movie.duration_minutes ? `${movie.duration_minutes}m` : null,
          ]
            .filter(Boolean)
            .join("  •  ")}
        </p>
      </div>
    </article>
  );
}
