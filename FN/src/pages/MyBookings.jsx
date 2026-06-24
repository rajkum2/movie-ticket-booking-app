import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cancelBooking, getMyBookings } from "../api";

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMyBookings()
      .then(setBookings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCancel = async (id) => {
    if (cancelling) return;
    if (!window.confirm(`Cancel booking #${id}? This frees the seats.`)) return;
    setCancelling(id);
    setError(null);
    try {
      await cancelBooking(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <section className="admin-page">
      <button className="link-btn" onClick={() => navigate("/")}>
        ← Back to movies
      </button>
      <h1 className="page-title">My bookings</h1>

      {loading && <p className="status">Loading…</p>}
      {error && <p className="status error">⚠️ {error}</p>}
      {!loading && !error && bookings.length === 0 && (
        <p className="status">You haven't booked anything yet.</p>
      )}

      {!loading && !error && bookings.length > 0 && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Movie</th>
                <th>Showtime</th>
                <th>Seats</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Booked At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>#{b.id}</td>
                  <td>{b.movie_title || b.movie_id}</td>
                  <td>{b.showtime}</td>
                  <td>{(b.seats || []).join(", ")}</td>
                  <td>${Number(b.total_amount).toFixed(2)}</td>
                  <td>
                    <span className="badge">{b.payment_status}</span>
                  </td>
                  <td>
                    {b.created_at
                      ? new Date(b.created_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <button
                      className="link-btn"
                      onClick={() => handleCancel(b.id)}
                      disabled={cancelling === b.id}
                    >
                      {cancelling === b.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
