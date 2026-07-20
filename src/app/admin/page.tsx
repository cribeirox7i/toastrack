"use client";

import { useAuth } from "@/components/AuthProvider";
import AuthScreen from "@/components/auth/AuthScreen";
import ImportPanel from "@/components/admin/ImportPanel";

/**
 * /admin — bulk data import (admin only).
 *
 * There is no client-side "password": on a static export the page source is
 * public, so any embedded secret would be trivially bypassable. The real gate is
 * Supabase Auth (login) + the user's `user_role` from the profile row, which is
 * itself protected by RLS. A logged-out visitor sees the login screen; a logged-
 * in non-admin is refused. All the import's writes are ordinary authenticated
 * calls, so RLS enforces "you can only replace your own data" regardless.
 */
function Splash() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex size-11 animate-pulse items-center justify-center rounded-full bg-accent-soft">
        <span className="size-5 rounded-full bg-accent" />
      </div>
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 text-center shadow-sm">
        <div className="text-[18px] font-bold">Acesso restrito</div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Esta área é exclusiva de administradores. Sua conta não tem permissão.
        </p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { session, appUser, loading } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <AuthScreen />;
  if (appUser?.user_role !== "admin") return <NotAuthorized />;
  return <ImportPanel userId={session.user.id} />;
}
