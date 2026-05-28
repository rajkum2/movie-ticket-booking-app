import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as api from "./api";

const AuthContext = createContext(null);
const USER_KEY = "cinebook.user";

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser);
  const [ready, setReady] = useState(!api.getToken());

  // If a token exists but we trust it stale, verify on mount.
  useEffect(() => {
    if (!api.getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((u) => {
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      })
      .catch(() => {
        api.setToken(null);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signIn = async (email, password) => {
    const { token, user: u } = await api.login(email, password);
    api.setToken(token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  };

  const signUp = async (payload) => {
    const { token, user: u } = await api.register(payload);
    api.setToken(token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore — clear locally anyway */
    }
    api.setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function RequireAuth({ children, role }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="status">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }
  return children;
}
