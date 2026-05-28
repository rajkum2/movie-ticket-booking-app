import { useNavigate } from "react-router-dom";

export default function MovieCard({ movie, variant = "landscape" }) {
  const navigate = useNavigate();
  const image = movie.backdrop_url || movie.poster_url;

  return (
    <article
      className={`nx-card nx-card-${variant}`}
      onClick={() => navigate(`/movies/${movie.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/movies/${movie.id}`);
      }}
    >
      <div className="nx-card-art">
        {image ? (
          <img src={image} alt={movie.title} loading="lazy" />
        ) : (
          <div className="poster-placeholder">{movie.title}</div>
        )}
        <div className="nx-card-titlebar">
          <span className="nx-card-title">{movie.title}</span>
        </div>
      </div>
      <div className="nx-card-hover">
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
