"use client";

import { useAuth } from "@/components/AuthProvider";
import AuthScreen from "@/components/auth/AuthScreen";
import CatalogProvider from "@/components/CatalogProvider";
import MainApp from "@/components/app/MainApp";

function Splash() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex size-11 animate-pulse items-center justify-center rounded-full bg-accent-soft">
        <span className="size-5 rounded-full bg-accent" />
      </div>
    </div>
  );
}

function InactiveNotice({ onExit }: { onExit: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 text-center shadow-sm">
        <div className="text-[18px] font-bold">Conta pendente de ativação</div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Sua conta está inativa e aguarda ativação manual por um administrador.
          Assim que for ativada, você poderá entrar normalmente.
        </p>
        <button
          onClick={onExit}
          className="mt-5 w-full rounded-xl bg-accent py-3 text-[14px] font-bold text-on-accent"
        >
          Voltar ao login
        </button>
      </div>
    </div>
  );
}

/** Top-level router: splash while resolving session, then auth / inactive / app. */
export default function AppShell() {
  const { session, appUser, loading, signOut } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <AuthScreen />;
  if (appUser?.user_status === "N") return <InactiveNotice onExit={() => void signOut()} />;
  return (
    <CatalogProvider>
      <MainApp />
    </CatalogProvider>
  );
}
