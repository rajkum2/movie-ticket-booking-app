import { useLocation, useNavigate } from "react-router-dom";

export default function Confirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();

  if (!state || !state.booking) {
    return (
      <div className="status">
        <p>Nothing to show here.</p>
        <button className="primary-btn" onClick={() => navigate("/")}>
          Browse movies
        </button>
      </div>
    );
  }

  const { booking, movieTitle } = state;

  return (
    <section className="confirmation-page">
      <div className="card success-card">
        <div className="success-icon">✓</div>
        <h1>Payment Successful!</h1>
        <p className="sub">Your booking is confirmed. (This was a demo payment.)</p>

        <div className="ticket">
          <div className="summary-line">
            <span>Booking ID</span>
            <strong>#{booking.id}</strong>
          </div>
          <div className="summary-line">
            <span>Movie</span>
            <strong>{movieTitle || booking.movie_title}</strong>
          </div>
          <div className="summary-line">
            <span>Showtime</span>
            <strong>{booking.showtime}</strong>
          </div>
          <div className="summary-line">
            <span>Seats</span>
            <strong>{booking.seats.join(", ")}</strong>
          </div>
          <div className="summary-line">
            <span>Name</span>
            <strong>{booking.customer_name}</strong>
          </div>
          <div className="summary-line total-line">
            <span>Amount paid</span>
            <strong>${Number(booking.total_amount).toFixed(2)}</strong>
          </div>
        </div>

        <button className="primary-btn" onClick={() => navigate("/")}>
          Book another movie
        </button>
      </div>
    </section>
  );
}
