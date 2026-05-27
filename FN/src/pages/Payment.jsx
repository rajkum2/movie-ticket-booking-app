import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createBooking } from "../api";

export default function Payment() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Guard: if the user lands here without a selection, send them home.
  if (!state || !state.movie || !state.seats?.length) {
    return (
      <div className="status">
        <p>No booking in progress.</p>
        <button className="primary-btn" onClick={() => navigate("/")}>
          Browse movies
        </button>
      </div>
    );
  }

  const { movie, showtime, seats } = state;
  const total = (Number(movie.price) * seats.length).toFixed(2);

  const handlePay = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const booking = await createBooking({
        movie_id: movie.id,
        showtime,
        customer_name: name,
        customer_email: email,
        seats,
      });
      navigate("/confirmation", {
        state: { booking, movieTitle: movie.title },
        replace: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="payment-page">
      <button className="link-btn" onClick={() => navigate(-1)}>
        ← Back to seats
      </button>
      <h1 className="page-title">Payment</h1>

      <div className="payment-layout">
        <form className="card payment-form" onSubmit={handlePay}>
          <h3>Your details</h3>
          <label>
            Full name
            <input
              type="text"
              value={name}
              required
              placeholder="Jane Doe"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              required
              placeholder="jane@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <h3>Card details (demo only)</h3>
          <p className="demo-note">
            This is a dummy checkout — no real payment is processed. Any values work.
          </p>
          <label>
            Card number
            <input type="text" placeholder="4242 4242 4242 4242" defaultValue="4242 4242 4242 4242" />
          </label>
          <div className="row-2">
            <label>
              Expiry
              <input type="text" placeholder="12/29" defaultValue="12/29" />
            </label>
            <label>
              CVC
              <input type="text" placeholder="123" defaultValue="123" />
            </label>
          </div>

          {error && <p className="status error">⚠️ {error}</p>}

          <button className="primary-btn" type="submit" disabled={submitting}>
            {submitting ? "Processing…" : `Pay $${total}`}
          </button>
        </form>

        <aside className="card order-summary">
          <h3>Order summary</h3>
          <div className="summary-line">
            <span>Movie</span>
            <strong>{movie.title}</strong>
          </div>
          <div className="summary-line">
            <span>Showtime</span>
            <strong>{showtime}</strong>
          </div>
          <div className="summary-line">
            <span>Seats</span>
            <strong>{seats.join(", ")}</strong>
          </div>
          <div className="summary-line">
            <span>Price / seat</span>
            <strong>${Number(movie.price).toFixed(2)}</strong>
          </div>
          <hr />
          <div className="summary-line total-line">
            <span>Total ({seats.length})</span>
            <strong>${total}</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}
