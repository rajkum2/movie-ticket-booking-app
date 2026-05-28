import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Top10Row({ title, movies }) {
  const railRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [movies]);

  const scroll = (dir) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  };

  if (!movies?.length) return null;
  const top = movies.slice(0, 10);

  return (
    <section className="nx-row">
      <h2 className="nx-row-title">{title}</h2>
      <div className="nx-row-frame">
        {canLeft && (
          <button className="nx-arrow nx-arrow-left" onClick={() => scroll(-1)}>
            ‹
          </button>
        )}
        <div className="nx-row-rail nx-top10-rail" ref={railRef}>
          {top.map((m, idx) => (
            <button
              key={m.id}
              className="nx-top10-item"
              onClick={() => navigate(`/movies/${m.id}`)}
              aria-label={`Number ${idx + 1}: ${m.title}`}
            >
              <span className="nx-top10-num" aria-hidden="true">
                {idx + 1}
              </span>
              <div className="nx-top10-poster">
                {m.poster_url ? (
                  <img src={m.poster_url} alt={m.title} loading="lazy" />
                ) : (
                  <div className="poster-placeholder">{m.title}</div>
                )}
              </div>
            </button>
          ))}
        </div>
        {canRight && (
          <button className="nx-arrow nx-arrow-right" onClick={() => scroll(1)}>
            ›
          </button>
        )}
      </div>
    </section>
  );
}
