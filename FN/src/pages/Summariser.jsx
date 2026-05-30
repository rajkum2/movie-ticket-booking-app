import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";

export default function Summariser() {
  const [movies, setMovies] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [listError, setListError] = useState(null);
  const [traceId, setTraceId] = useState(null);
  const [score, setScore] = useState(null);
  const abortRef = useRef({ cancelled: false });

  useEffect(() => {
    api
      .getMovies()
      .then(setMovies)
      .catch((e) => setListError(e.message));
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return movies
      .filter((m) => m.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [movies, query]);

  const reset = () => {
    abortRef.current.cancelled = true;
    setSelected(null);
    setSummary("");
    setError(null);
    setStreaming(false);
    setTraceId(null);
    setScore(null);
  };

  const pickMovie = async (movie) => {
    abortRef.current.cancelled = true;
    const run = { cancelled: false };
    abortRef.current = run;

    setSelected(movie);
    setSummary("");
    setError(null);
    setTraceId(null);
    setScore(null);
    setStreaming(true);

    try {
      const { traceId: tid, stream } = await api.startSummary(movie.id);
      if (tid) setTraceId(tid);
      for await (const chunk of stream) {
        if (run.cancelled) return;
        setSummary((prev) => prev + chunk);
      }
    } catch (e) {
      if (!run.cancelled) setError(e.message);
    } finally {
      if (!run.cancelled) setStreaming(false);
    }
  };

  const handleScore = async (value) => {
    if (!traceId) return;
    setScore(value);
    try {
      await api.scoreTrace(traceId, value);
    } catch (e) {
      setScore(null);
      setError(`Could not save feedback: ${e.message}`);
    }
  };

  return (
    <section className="summariser">
      <h1 className="page-title">AI Summariser</h1>
      <p className="summariser-lede">
        Search any movie and get an AI-generated summary powered by DeepSeek.
      </p>

      {!selected && (
        <>
          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder="Search for a movie..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              aria-label="Search movies to summarise"
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {listError && <p className="status error">⚠️ {listError}</p>}

          {query.trim() && results.length === 0 && !listError && (
            <p className="status">No movies match “{query}”.</p>
          )}

          {results.length > 0 && (
            <ul className="summariser-results">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="summariser-result"
                    onClick={() => pickMovie(m)}
                  >
                    {m.poster_url ? (
                      <img
                        src={m.poster_url}
                        alt=""
                        className="summariser-thumb"
                        loading="lazy"
                      />
                    ) : (
                      <div className="summariser-thumb summariser-thumb-empty" />
                    )}
                    <div className="summariser-result-info">
                      <strong>{m.title}</strong>
                      <span className="meta">
                        {[m.genre, m.language].filter(Boolean).join(" • ")}
                      </span>
                    </div>
                    <span className="summariser-cta">Summarise →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selected && (
        <article className="summariser-output">
          <header className="summariser-output-head">
            <h2>{selected.title}</h2>
            <button className="link-btn" onClick={reset}>
              ← Search another
            </button>
          </header>

          {error && <p className="status error">⚠️ {error}</p>}

          <p className="summariser-summary">
            {summary}
            {streaming && <span className="summariser-cursor">▍</span>}
          </p>

          {!streaming && !error && summary && (
            <>
              {traceId && (
                <div className="chat-feedback">
                  <button
                    type="button"
                    className={`feedback-btn ${score === 1 ? "feedback-up" : ""}`}
                    onClick={() => handleScore(1)}
                    disabled={score !== null}
                    aria-label="Helpful"
                    title="Helpful"
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    className={`feedback-btn ${score === 0 ? "feedback-down" : ""}`}
                    onClick={() => handleScore(0)}
                    disabled={score !== null}
                    aria-label="Not helpful"
                    title="Not helpful"
                  >
                    👎
                  </button>
                  {score !== null && (
                    <span className="feedback-thanks">Thanks for the feedback</span>
                  )}
                </div>
              )}
              <p className="summariser-foot">
                Generated by DeepSeek · saved for future visits
              </p>
            </>
          )}
        </article>
      )}
    </section>
  );
}
