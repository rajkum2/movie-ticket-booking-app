import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { googleEnabled, useAuth } from "../auth.jsx";

export default function Login() {
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
      // Browser is being redirected — nothing more to do.
    } catch (err) {
      setError(err.message);
      setGoogleBusy(false);
    }
  };

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

        {googleEnabled && (
          <>
            <div className="auth-divider"><span>or</span></div>
            <button
              type="button"
              className="google-btn"
              onClick={handleGoogle}
              disabled={googleBusy}
            >
              <span className="google-g" aria-hidden="true">G</span>
              {googleBusy ? "Redirecting…" : "Continue with Google"}
            </button>
          </>
        )}

        <div className="demo-creds">
          <p className="demo-note">Demo accounts</p>
          <button
            type="button"
            className="link-btn"
            onClick={() => fill("admin@cinebook.com", "admin123")}
          >
            Admin → admin@cinebook.com / admin123
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => fill("user@cinebook.com", "user123")}
          >
            User → user@cinebook.com / user123
          </button>
        </div>

        <p className="auth-foot">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </section>
  );
}
