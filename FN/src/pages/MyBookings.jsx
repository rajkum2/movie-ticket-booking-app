import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyBookings } from "../api";

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMyBookings()
      .then(setBookings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
