// Supabase client used only for the Google OAuth handshake.
// Our app's session is the bearer token issued by our own backend; the
// Supabase session is short-lived (we extract the JWT and discard).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true, // needed so detectSessionInUrl can complete the code-exchange
        autoRefreshToken: false,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: "cinebook.supabase.session",
      },
    })
  : null;
