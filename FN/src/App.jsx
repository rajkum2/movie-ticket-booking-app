import { Link, Route, Routes, useNavigate } from "react-router-dom";
import Movies from "./pages/Movies.jsx";
import SeatSelection from "./pages/SeatSelection.jsx";
import Payment from "./pages/Payment.jsx";
import Confirmation from "./pages/Confirmation.jsx";
import Admin from "./pages/Admin.jsx";
import MovieManager from "./pages/MovieManager.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import MyBookings from "./pages/MyBookings.jsx";
import { RequireAuth, useAuth } from "./auth.jsx";

function Header() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header className="app-header">
      <Link to="/" className="brand">
        🎬 CineBook
      </Link>
      <nav className="header-nav">
        {user?.role === "admin" && (
          <>
            <button className="link-btn" onClick={() => navigate("/admin")}>
              Dashboard
            </button>
            <button className="link-btn" onClick={() => navigate("/manage")}>
              Manage Movies
            </button>
          </>
        )}
        {user?.role === "user" && (
          <button className="link-btn" onClick={() => navigate("/my-bookings")}>
            My bookings
          </button>
        )}
        {user ? (
          <>
            <span className="user-chip">
              {user.full_name || user.email}
              <span className={`role-tag role-${user.role}`}>{user.role}</span>
            </span>
            <button className="admin-btn" onClick={handleLogout}>
              Sign out
            </button>
          </>
        ) : (
          <button className="admin-btn" onClick={() => navigate("/login")}>
            Sign in
          </button>
        )}
      </nav>
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
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/seats/:movieId"
            element={
              <RequireAuth>
                <SeatSelection />
              </RequireAuth>
            }
          />
          <Route
            path="/payment"
            element={
              <RequireAuth>
                <Payment />
              </RequireAuth>
            }
          />
          <Route
            path="/confirmation"
            element={
              <RequireAuth>
                <Confirmation />
              </RequireAuth>
            }
          />
          <Route
            path="/my-bookings"
            element={
              <RequireAuth>
                <MyBookings />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth role="admin">
                <Admin />
              </RequireAuth>
            }
          />
          <Route
            path="/manage"
            element={
              <RequireAuth role="admin">
                <MovieManager />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
