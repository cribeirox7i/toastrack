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
import { SessionProvider, useSession, signOut as nextAuthSignOut } from "next-auth/react";
import type { PublicUser } from "@/lib/sheets/users";
import { wipeLocalData } from "@/lib/offline/db";
import { noCacheUrl } from "@/lib/utils";

type AppUser = PublicUser;

type AuthContextValue = {
  userId: string | null;
  userEmail: string | null;
  role: "admin" | "user" | null;
  deveTrocarSenha: boolean;
  appUser: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAppUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Fica por baixo do SessionProvider do NextAuth (useSession só funciona como descendente dele).
 * Carrega o perfil completo (`/api/profile` — nome, paleta, modo, idioma) e o mantém em sincronia
 * com o id da sessão, igual o AuthProvider antigo fazia com a linha `public.user` do Supabase.
 */
function AuthInner({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const currentUserId = useRef<string | null>(null);

  const loadAppUser = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch(noCacheUrl("/api/profile"), { cache: "no-store" });
      setAppUser(res.ok ? await res.json() : null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId) {
      currentUserId.current = null;
      setAppUser(null);
      setProfileLoading(false);
      return;
    }
    // Só refaz o fetch quando o usuário de fato muda (evita refetch em cada refresh de token).
    if (userId !== currentUserId.current) {
      currentUserId.current = userId;
      void loadAppUser();
    }
  }, [session?.user.id, loadAppUser]);

  const signOut = useCallback(async () => {
    // Antes do signOut do NextAuth: sem isso, os dados de quem saiu continuam legíveis no
    // IndexedDB pro próximo login neste mesmo aparelho (ver src/lib/offline/db.ts).
    await wipeLocalData().catch(() => {});
    await nextAuthSignOut({ redirect: false });
    setAppUser(null);
  }, []);

  const loading = status === "loading" || (status === "authenticated" && profileLoading);

  return (
    <AuthContext.Provider
      value={{
        userId: session?.user.id ?? null,
        userEmail: session?.user.email ?? null,
        role: session?.user.role ?? null,
        deveTrocarSenha: session?.user.deveTrocarSenha ?? false,
        appUser,
        loading,
        signOut,
        refreshAppUser: loadAppUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthInner>{children}</AuthInner>
    </SessionProvider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
