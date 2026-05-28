import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const fill = (e, p) => {
    setEmail(e);
    setPassword(p);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await signIn(email, password);
      navigate(user.role === "admin" ? "/admin" : redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Sign in to CineBook</h1>
        <p className="sub">Use one of the demo accounts or your own.</p>

        <label>
          Email
          <input
            type="email"
            value={email}
            required
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            required
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="status error">⚠️ {error}</p>}

        <button className="primary-btn" type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <div className="demo-creds">
          <p className="demo-note">Demo accounts</p>
          <button
            type="button"
            className="link-btn"
            onClick={() => fill("admin@cinebook.test", "admin123")}
          >
            Admin → admin@cinebook.test / admin123
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => fill("user@cinebook.test", "user123")}
          >
            User → user@cinebook.test / user123
          </button>
        </div>

        <p className="auth-foot">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </section>
  );
}
