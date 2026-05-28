import { Link, Route, Routes, useNavigate } from "react-router-dom";
import Movies from "./pages/Movies.jsx";
import SeatSelection from "./pages/SeatSelection.jsx";
import Payment from "./pages/Payment.jsx";
import Confirmation from "./pages/Confirmation.jsx";
import Admin from "./pages/Admin.jsx";
import MovieManager from "./pages/MovieManager.jsx";

function Header() {
  const navigate = useNavigate();
  return (
    <header className="app-header">
      <Link to="/" className="brand">
        🎬 CineBook
      </Link>
      <div style={{ display: "flex", gap: "8px" }}>
        <button className="admin-btn" onClick={() => navigate("/manage")}>
          Manage Movies
        </button>
        <button className="admin-btn" onClick={() => navigate("/admin")}>
          Admin
        </button>
      </div>
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
          <Route path="/manage" element={<MovieManager />} />
        </Routes>
      </main>
    </div>
  );
}
