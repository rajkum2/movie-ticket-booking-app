import { useRef, useState, useEffect } from "react";
import MovieCard from "./MovieCard.jsx";

export default function MovieRow({ title, movies, size = "md" }) {
  const railRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

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
    const step = Math.round(el.clientWidth * 0.85);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  if (!movies?.length) return null;

  return (
    <section className="nx-row">
      <h2 className="nx-row-title">{title}</h2>
      <div className="nx-row-frame">
        {canLeft && (
          <button
            className="nx-arrow nx-arrow-left"
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
          >
            ‹
          </button>
        )}
        <div className="nx-row-rail" ref={railRef}>
          {movies.map((m) => (
            <MovieCard key={m.id} movie={m} size={size} />
          ))}
        </div>
        {canRight && (
          <button
            className="nx-arrow nx-arrow-right"
            onClick={() => scroll(1)}
            aria-label="Scroll right"
          >
            ›
          </button>
        )}
      </div>
    </section>
  );
}
