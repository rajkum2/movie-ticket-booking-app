import { Link, Route, Routes, useNavigate } from "react-router-dom";
import Movies from "./pages/Movies.jsx";
import SeatSelection from "./pages/SeatSelection.jsx";
import Payment from "./pages/Payment.jsx";
import Confirmation from "./pages/Confirmation.jsx";
import Admin from "./pages/Admin.jsx";

function Header() {
  const navigate = useNavigate();
  return (
    <header className="app-header">
      <Link to="/" className="brand">
        🎬 CineBook
      </Link>
      <button className="admin-btn" onClick={() => navigate("/admin")}>
        Admin
      </button>
    </header>
  );
}

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Movies />} />
          <Route path="/seats/:movieId" element={<SeatSelection />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/confirmation" element={<Confirmation />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  );
}
