"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAppUser, logAccess, type AppUser } from "@/lib/auth";

type AuthContextValue = {
  session: Session | null;
  appUser: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAppUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the Supabase auth session and the matching public."user" profile row.
 * Resolves the initial session on mount and subscribes to auth changes; the
 * static-export app is fully client-side, so this is the single source of truth
 * for "who is logged in". 2FA and the inactive-account gate live in the login
 * flow (AuthScreen); this provider just tracks session + profile.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserId = useRef<string | null>(null);

  const loadAppUser = useCallback(async (userId: string | null) => {
    if (!userId) {
      setAppUser(null);
      return;
    }
    const row = await fetchAppUser(userId);
    setAppUser(row);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const s = data.session;
      setSession(s);
      currentUserId.current = s?.user.id ?? null;
      await loadAppUser(s?.user.id ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      const nextId = s?.user.id ?? null;
      // Only refetch the profile when the actual user changes (ignore token refreshes).
      if (nextId !== currentUserId.current) {
        currentUserId.current = nextId;
        void loadAppUser(nextId);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadAppUser]);

  const signOut = useCallback(async () => {
    await logAccess("logout");
    await getSupabaseClient().auth.signOut();
    setAppUser(null);
  }, []);

  const refreshAppUser = useCallback(async () => {
    await loadAppUser(currentUserId.current);
  }, [loadAppUser]);

  return (
    <AuthContext.Provider value={{ session, appUser, loading, signOut, refreshAppUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
