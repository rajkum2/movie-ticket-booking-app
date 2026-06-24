import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BookingsTab from "./admin/BookingsTab.jsx";
import MoviesTab from "./admin/MoviesTab.jsx";
import UsersTab from "./admin/UsersTab.jsx";
import CapabilitiesTab from "./admin/CapabilitiesTab.jsx";

const TABS = [
  { id: "bookings", label: "Bookings" },
  { id: "movies", label: "Movies" },
  { id: "users", label: "Users" },
  { id: "capabilities", label: "Capabilities" },
];

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("bookings");

  return (
    <section className="admin-page">
      <button className="link-btn" onClick={() => navigate("/")}>
        ← Back to site
      </button>
      <h1 className="page-title">Admin dashboard</h1>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === "bookings" && <BookingsTab />}
        {tab === "movies" && <MoviesTab />}
        {tab === "users" && <UsersTab />}
        {tab === "capabilities" && <CapabilitiesTab />}
      </div>
    </section>
  );
}
