import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as api from "./api";
import { supabase, supabaseConfigured } from "./supabaseClient";

const AuthContext = createContext(null);
const USER_KEY = "cinebook.user";

export const googleEnabled = supabaseConfigured;

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

  const signInWithGoogle = async () => {
    if (!supabase) {
      throw new Error("Google sign-in is not configured");
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw new Error(error.message);
    // The browser is now redirecting to Google; nothing more to do here.
  };

  const finishGoogleSignIn = async () => {
    if (!supabase) throw new Error("Google sign-in is not configured");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    if (!data.session?.access_token) {
      throw new Error("No Supabase session found in callback");
    }
    const { token, user: u } = await api.googleExchange(data.session.access_token);
    api.setToken(token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    // Drop the supabase session — we only needed it for the exchange.
    await supabase.auth.signOut();
    return u;
  };

  return (
    <AuthContext.Provider
      value={{ user, ready, signIn, signUp, signOut, signInWithGoogle, finishGoogleSignIn }}
    >
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
