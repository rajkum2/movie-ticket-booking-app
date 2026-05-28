import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onChange = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signUp(form);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Create an account</h1>
        <p className="sub">Book movies with a single click.</p>

        <label>
          Full name
          <input
            type="text"
            value={form.full_name}
            placeholder="Jane Doe"
            onChange={onChange("full_name")}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            required
            placeholder="you@example.com"
            onChange={onChange("email")}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            required
            minLength={6}
            placeholder="At least 6 characters"
            onChange={onChange("password")}
          />
        </label>

        {error && <p className="status error">⚠️ {error}</p>}

        <button className="primary-btn" type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </button>

        <p className="auth-foot">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </section>
  );
}
