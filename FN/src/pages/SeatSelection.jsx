import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMovie, getSeatAvailability } from "../api";

const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const COLS = 10;

export default function SeatSelection() {
  const { movieId } = useParams();
  const navigate = useNavigate();

  const [movie, setMovie] = useState(null);
  const [showtime, setShowtime] = useState("");
  const [booked, setBooked] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load the movie once.
  useEffect(() => {
    getMovie(movieId)
      .then((m) => {
        setMovie(m);
        setShowtime(m.showtimes?.[0] || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [movieId]);

  // Reload booked seats whenever the showtime changes.
  useEffect(() => {
    if (!movie || !showtime) return;
    setSelected([]);
    getSeatAvailability(movie.id, showtime)
      .then((d) => setBooked(d.booked_seats))
      .catch((e) => setError(e.message));
  }, [movie, showtime]);

  const toggleSeat = (seat) => {
    if (booked.includes(seat)) return;
    setSelected((prev) =>
      prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev, seat]
    );
  };

  const proceed = () => {
    navigate("/payment", {
      state: { movie, showtime, seats: selected },
    });
  };

  if (loading) return <p className="status">Loading…</p>;
  if (error) return <p className="status error">⚠️ {error}</p>;
  if (!movie) return <p className="status">Movie not found.</p>;

  const total = (Number(movie.price) * selected.length).toFixed(2);

  return (
    <section className="seat-page">
      <button className="link-btn" onClick={() => navigate("/")}>
        ← Back to movies
      </button>
      <h1 className="page-title">{movie.title}</h1>

      <div className="showtime-row">
        <span className="label">Showtime:</span>
        {(movie.showtimes || []).map((st) => (
          <button
            key={st}
            className={`chip ${st === showtime ? "active" : ""}`}
            onClick={() => setShowtime(st)}
          >
            {st}
          </button>
        ))}
      </div>

      <div className="screen">SCREEN</div>

      <div className="seat-map">
        {ROWS.map((row) => (
          <div key={row} className="seat-row">
            <span className="row-label">{row}</span>
            {Array.from({ length: COLS }, (_, i) => {
              const seat = `${row}${i + 1}`;
              const isBooked = booked.includes(seat);
              const isSelected = selected.includes(seat);
              return (
                <button
                  key={seat}
                  className={`seat ${isBooked ? "booked" : ""} ${
                    isSelected ? "selected" : ""
                  }`}
                  onClick={() => toggleSeat(seat)}
                  disabled={isBooked}
                  title={seat}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="legend">
        <span>
          <i className="seat-sample" /> Available
        </span>
        <span>
          <i className="seat-sample selected" /> Selected
        </span>
        <span>
          <i className="seat-sample booked" /> Booked
        </span>
      </div>

      <div className="summary-bar">
        <div>
          <strong>{selected.length}</strong> seat(s) selected
          {selected.length > 0 && <span className="seats-list"> — {selected.join(", ")}</span>}
          <div className="total">Total: ${total}</div>
        </div>
        <button
          className="primary-btn"
          disabled={selected.length === 0}
          onClick={proceed}
        >
          Proceed to Payment
        </button>
      </div>
    </section>
  );
}
