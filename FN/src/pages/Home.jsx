import { useEffect, useMemo, useState } from "react";
import { getMovies, getMyBookings } from "../api";
import { useAuth } from "../auth.jsx";
import Hero from "../components/Hero.jsx";
import MovieRow from "../components/MovieRow.jsx";
import Top10Row from "../components/Top10Row.jsx";

const MIN_PER_ROW = 3;

export default function Home() {
  const { user } = useAuth();
  const [movies, setMovies] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const tasks = [getMovies()];
    if (user) tasks.push(getMyBookings().catch(() => []));
    Promise.all(tasks)
      .then(([ms, bs]) => {
        setMovies(ms || []);
        if (bs) setBookings(bs || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  const sections = useMemo(() => {
    if (!movies.length) return null;
    const byId = Object.fromEntries(movies.map((m) => [m.id, m]));

    const ranked = [...movies].sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0)
    );
    const featured = ranked.find((m) => m.backdrop_url || m.poster_url) || ranked[0];

    const trending = ranked.slice(0, 10);

    // Recently booked → "Continue watching" rail
    const continueWatching = (bookings || [])
      .map((b) => byId[b.movie_id])
      .filter(Boolean)
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
      .slice(0, 12);

    const onlyOn = ranked.filter((m) => (m.rating ?? 0) >= 8.5).slice(0, 16);
    const acclaimed = ranked.filter((m) => (m.rating ?? 0) >= 8.0);

    const newOn = [...movies].sort((a, b) => b.id - a.id).slice(0, 16);

    const quickBites = movies
      .filter((m) => m.duration_minutes && m.duration_minutes <= 115)
      .slice(0, 16);
    const epics = movies
      .filter((m) => m.duration_minutes && m.duration_minutes >= 150)
      .slice(0, 16);

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

    return {
      featured,
      trending,
      continueWatching,
      onlyOn,
      acclaimed,
      newOn,
      quickBites,
      epics,
      byGenre,
      byLanguage,
    };
  }, [movies, bookings]);

  if (loading) return <p className="status">Loading…</p>;
  if (error) return <p className="status error">⚠️ {error}</p>;
  if (!sections) return <p className="status">No movies available.</p>;

  const genreEntries = Object.entries(sections.byGenre)
    .filter(([, list]) => list.length >= MIN_PER_ROW)
    .sort(([a], [b]) => a.localeCompare(b));

  const langEntries = Object.entries(sections.byLanguage)
    .filter(([, list]) => list.length >= MIN_PER_ROW)
    .sort(([, a], [, b]) => b.length - a.length);

  return (
    <div className="nx-home">
      <Hero movie={sections.featured} />
      <div className="nx-rows">
        {sections.continueWatching.length > 0 && (
          <MovieRow
            title={`Continue watching for ${user?.full_name || user?.email?.split("@")[0]}`}
            movies={sections.continueWatching}
          />
        )}

        <Top10Row title="Top 10 Movies Today" movies={sections.trending} />

        {sections.onlyOn.length >= MIN_PER_ROW && (
          <MovieRow title="Only on CineBook" movies={sections.onlyOn} />
        )}

        {sections.newOn.length >= MIN_PER_ROW && (
          <MovieRow title="New on CineBook" movies={sections.newOn} />
        )}

        {sections.acclaimed.length >= MIN_PER_ROW && (
          <MovieRow title="Critically Acclaimed" movies={sections.acclaimed} />
        )}

        {sections.quickBites.length >= MIN_PER_ROW && (
          <MovieRow title="Quick Bites — Under 2 Hours" movies={sections.quickBites} />
        )}

        {sections.epics.length >= MIN_PER_ROW && (
          <MovieRow title="Epic Runtimes" movies={sections.epics} />
        )}

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
