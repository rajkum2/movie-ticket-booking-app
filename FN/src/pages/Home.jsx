import { useEffect, useMemo, useState } from "react";
import { getMovies } from "../api";
import Hero from "../components/Hero.jsx";
import MovieRow from "../components/MovieRow.jsx";

const MIN_PER_GENRE_ROW = 3;

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMovies()
      .then(setMovies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const { featured, trending, topPicks, byGenre, byLanguage } = useMemo(() => {
    if (!movies.length) {
      return { featured: null, trending: [], topPicks: [], byGenre: {}, byLanguage: {} };
    }
    const ranked = [...movies].sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0)
    );
    const featured = ranked.find((m) => m.poster_url) || ranked[0];

    const trending = ranked.slice(0, 10);
    const topPicks = [...movies].sort(() => Math.random() - 0.5).slice(0, 16);

    const byGenre = {};
    for (const m of movies) {
      if (!m.genre) continue;
      (byGenre[m.genre] ||= []).push(m);
    }
    const byLanguage = {};
    for (const m of movies) {
      if (!m.language) continue;
      (byLanguage[m.language] ||= []).push(m);
    }

    return { featured, trending, topPicks, byGenre, byLanguage };
  }, [movies]);

  if (loading) return <p className="status">Loading…</p>;
  if (error) return <p className="status error">⚠️ {error}</p>;
  if (!movies.length) return <p className="status">No movies available.</p>;

  const genreEntries = Object.entries(byGenre)
    .filter(([, list]) => list.length >= MIN_PER_GENRE_ROW)
    .sort(([a], [b]) => a.localeCompare(b));

  const langEntries = Object.entries(byLanguage)
    .filter(([, list]) => list.length >= MIN_PER_GENRE_ROW)
    .sort(([, a], [, b]) => b.length - a.length);

  return (
    <div className="nx-home">
      <Hero movie={featured} />
      <div className="nx-rows">
        <MovieRow title="Trending Now" movies={trending} />
        <MovieRow title="Top Picks for You" movies={topPicks} />
        {genreEntries.map(([genre, list]) => (
          <MovieRow key={`g-${genre}`} title={genre} movies={list} />
        ))}
        {langEntries.map(([lang, list]) => (
          <MovieRow key={`l-${lang}`} title={`In ${lang}`} movies={list} />
        ))}
      </div>
    </div>
  );
}
