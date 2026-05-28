import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBookings } from "../api";

export default function Admin() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    getBookings()
      .then(setBookings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const revenue = bookings
    .reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
    .toFixed(2);
  const totalSeats = bookings.reduce((sum, b) => sum + (b.seats?.length || 0), 0);

  return (
    <section className="admin-page">
      <button className="link-btn" onClick={() => navigate("/")}>
        ← Back to site
      </button>
      <div className="admin-head">
        <h1 className="page-title">Admin — Bookings</h1>
        <button className="primary-btn small" onClick={load}>
          Refresh
        </button>
      </div>

      {!loading && !error && (
        <div className="stats">
          <div className="stat">
            <span>{bookings.length}</span>
            <label>Bookings</label>
          </div>
          <div className="stat">
            <span>{totalSeats}</span>
            <label>Seats sold</label>
          </div>
          <div className="stat">
            <span>${revenue}</span>
            <label>Revenue</label>
          </div>
        </div>
      )}

      {loading && <p className="status">Loading bookings…</p>}
      {error && <p className="status error">⚠️ {error}</p>}

      {!loading && !error && bookings.length === 0 && (
        <p className="status">No bookings yet.</p>
      )}

      {!loading && !error && bookings.length > 0 && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Movie</th>
                <th>Showtime</th>
                <th>Customer</th>
                <th>Email</th>
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
                  <td>{b.customer_name}</td>
                  <td>{b.customer_email}</td>
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
