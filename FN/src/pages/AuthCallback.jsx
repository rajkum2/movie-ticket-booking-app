import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function AuthCallback() {
  const { finishGoogleSignIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    // supabase-js (detectSessionInUrl + PKCE) will pick up the ?code= param
    // automatically. Give it a tick to settle, then exchange and proceed.
    let cancelled = false;
    const run = async () => {
      // Tiny delay so supabase-js can finish the code exchange in the
      // background before we ask for the session.
      await new Promise((r) => setTimeout(r, 150));
      try {
        const user = await finishGoogleSignIn();
        if (cancelled) return;
        navigate(user.role === "admin" ? "/admin" : "/", { replace: true });
      } catch (err) {
        if (!cancelled) setError(err.message || "Sign-in failed");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [finishGoogleSignIn, navigate]);

  if (error) {
    return (
      <section className="auth-page">
        <div className="card auth-card">
          <h1>Sign-in failed</h1>
          <p className="status error">⚠️ {error}</p>
          <button className="primary-btn" onClick={() => navigate("/login")}>
            Back to sign in
          </button>
        </div>
      </section>
    );
  }
  return <p className="status">Finishing sign in…</p>;
}
