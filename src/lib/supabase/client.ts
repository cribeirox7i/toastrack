import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for Toastrack.
 *
 * The whole app is a static export (no server), so every request to Supabase
 * (Auth, Postgres via PostgREST, Storage) happens from the browser using the
 * anon key. Access control is enforced by Row Level Security policies in the
 * database, NOT by hiding calls here — see supabase/migrations for the policies.
 *
 * Session persistence (spec C.8 — 15 days): persistSession + autoRefreshToken
 * keep the JWT alive across reloads/visits. The actual 15-day lifetime is set by
 * the refresh-token expiry in the Supabase dashboard (Auth settings); this client
 * just persists and silently refreshes it. The "skip 2FA while the session is
 * still valid" rule is handled in app logic on top of this, not by the SDK.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in development; in a misconfigured production build this surfaces
  // immediately instead of silently making unauthenticated requests.
  throw new Error(
    "Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
  );
}

let browserClient: SupabaseClient | null = null;

/** Returns a singleton Supabase client (created lazily on first use in the browser). */
export function getSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}
