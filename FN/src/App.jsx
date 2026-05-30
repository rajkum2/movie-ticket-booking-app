import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Movies from "./pages/Movies.jsx";
import SeatSelection from "./pages/SeatSelection.jsx";
import Payment from "./pages/Payment.jsx";
import Confirmation from "./pages/Confirmation.jsx";
import Admin from "./pages/Admin.jsx";
import MovieManager from "./pages/MovieManager.jsx";
import MovieDetails from "./pages/MovieDetails.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import MyBookings from "./pages/MyBookings.jsx";
import Summariser from "./pages/Summariser.jsx";
import Chat from "./pages/Chat.jsx";
import { RequireAuth, useAuth } from "./auth.jsx";

function Header() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const submitSearch = (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    navigate(`/browse?q=${encodeURIComponent(search.trim())}`);
    setSearchOpen(false);
    setSearch("");
  };

  const handleLogout = async () => {
    await signOut();
    setMenuOpen(false);
    navigate("/login", { replace: true });
  };

  return (
    <header className={`nx-header ${scrolled ? "nx-header-solid" : ""}`}>
      <Link to="/" className="brand">
        🎬 CineBook
      </Link>

      <nav className="nx-nav">
        <NavLink to="/" end className="nx-nav-link">
          Home
        </NavLink>
        <NavLink to="/browse" className="nx-nav-link">
          Browse
        </NavLink>
        {user && (
          <NavLink to="/summariser" className="nx-nav-link">
            AI Summariser
          </NavLink>
        )}
        {user && (
          <NavLink to="/chat" className="nx-nav-link">
            AI Chat
          </NavLink>
        )}
        {user && (
          <NavLink to="/my-bookings" className="nx-nav-link">
            My bookings
          </NavLink>
        )}
        {user?.role === "admin" && (
          <NavLink to="/admin" className="nx-nav-link">
            Admin
          </NavLink>
        )}
      </nav>

      <div className="nx-header-actions">
        {searchOpen ? (
          <form className="nx-search" onSubmit={submitSearch}>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Titles, genres, languages…"
              onBlur={() => !search && setSearchOpen(false)}
            />
            <button type="submit" className="nx-icon-btn" aria-label="Search">
              🔍
            </button>
          </form>
        ) : (
          <button
            className="nx-icon-btn"
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
          >
            🔍
          </button>
        )}

        {user ? (
          <div className="nx-profile">
            <button
              className="nx-profile-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="nx-avatar">
                {(user.full_name || user.email).charAt(0).toUpperCase()}
              </span>
              <span className="nx-caret">▾</span>
            </button>
            {menuOpen && (
              <>
                <div
                  className="nx-menu-backdrop"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="nx-menu">
                  <div className="nx-menu-head">
                    <strong>{user.full_name || user.email}</strong>
                    <span className={`role-tag role-${user.role}`}>
                      {user.role}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/my-bookings");
                    }}
                  >
                    My bookings
                  </button>
                  {user.role === "admin" && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/admin");
                      }}
                    >
                      Admin dashboard
                    </button>
                  )}
                  {user.role === "admin" && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/manage");
                      }}
                    >
                      Manage movies
                    </button>
                  )}
                  <div className="nx-menu-sep" />
                  <button onClick={handleLogout}>Sign out</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button className="nx-btn-signin" onClick={() => navigate("/login")}>
            Sign in
          </button>
        )}
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
          <Route path="/" element={<Home />} />
          <Route path="/browse" element={<Movies />} />
          <Route path="/movies/:movieId" element={<MovieDetails />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
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
            path="/summariser"
            element={
              <RequireAuth>
                <Summariser />
              </RequireAuth>
            }
          />
          <Route
            path="/chat"
            element={
              <RequireAuth>
                <Chat />
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
      <Footer />
    </div>
  );
}
