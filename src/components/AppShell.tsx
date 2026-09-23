"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import AuthScreen from "@/components/auth/AuthScreen";
import CatalogProvider from "@/components/CatalogProvider";
import MainApp from "@/components/app/MainApp";
import TrocarSenhaObrigatoria from "@/components/auth/TrocarSenhaObrigatoria";

type GlyphProps = { className?: string };

// Caneca de cerveja com espuma - mesmo silhueta do ícone do app.
function BeerGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className}>
      <circle cx="10" cy="9.5" r="3" />
      <circle cx="15.5" cy="8" r="3.6" />
      <circle cx="21" cy="9.5" r="3" />
      <path d="M8 10h15l-2 15.2A2.2 2.2 0 0 1 18.8 27h-5.6A2.2 2.2 0 0 1 11 25.2L8 10Z" />
      <circle cx="24.5" cy="15.5" r="4.3" />
      <circle cx="24.5" cy="15.5" r="2.4" fill="var(--bg)" />
    </svg>
  );
}

// Taça de vinho - bojo arredondado, haste fina, base.
function WineGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className}>
      <path d="M11 4h10l-1.1 10.2a3.9 3.9 0 0 1-7.8 0L11 4Z" />
      <rect x="15" y="17.5" width="2" height="7.5" />
      <rect x="10.5" y="26.5" width="11" height="2.2" rx="1.1" />
    </svg>
  );
}

// Taça de drink (martini) - bojo triangular, haste, base.
function DrinkGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className}>
      <path d="M6 6h20l-8.6 10.4v8.1h-2.8v-8.1L6 6Z" />
      <rect x="10.5" y="26.5" width="11" height="2.2" rx="1.1" />
      <circle cx="22.5" cy="7.2" r="1.7" />
    </svg>
  );
}

// Copo baixo de destilado, com linha de nível.
function SpiritGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className}>
      <path d="M9.5 8h13l-1.6 17.2a2.2 2.2 0 0 1-2.2 2h-5.4a2.2 2.2 0 0 1-2.2-2L9.5 8Z" />
      <rect x="10.3" y="16.5" width="11.4" height="2" fill="var(--bg)" opacity="0.55" />
    </svg>
  );
}

const SPLASH_GLYPHS = [BeerGlyph, WineGlyph, DrinkGlyph, SpiritGlyph];

function Splash() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % SPLASH_GLYPHS.length);
    }, 800);
    return () => clearInterval(id);
  }, []);

  const Glyph = SPLASH_GLYPHS[index];

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="relative flex size-14 items-center justify-center rounded-full bg-accent-soft">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent-soft" />
        <Glyph key={index} className="relative size-7 animate-[splash-pop_0.5s_ease-out] text-accent" />
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

/**
 * Top-level router: splash → auth → conta inativa → troca de senha obrigatória → app.
 * `deveTrocarSenha` vem da sessão JWT (definido no login); TrocarSenhaObrigatoria chama
 * `update()` do NextAuth ao trocar com sucesso, o que dispara o callback `jwt` de novo com
 * `trigger === "update"` e zera essa flag sem exigir logout/login (ver TODO em src/auth.ts).
 */
export default function AppShell() {
  const { userId, appUser, loading, deveTrocarSenha, signOut } = useAuth();
  const [forcarTrocaConcluida, setForcarTrocaConcluida] = useState(false);

  if (loading) return <Splash />;
  if (!userId) return <AuthScreen />;
  if (appUser?.user_status === "N") return <InactiveNotice onExit={() => void signOut()} />;
  if (deveTrocarSenha && !forcarTrocaConcluida) {
    return <TrocarSenhaObrigatoria onDone={() => setForcarTrocaConcluida(true)} />;
  }
  return (
    <CatalogProvider>
      <MainApp />
    </CatalogProvider>
  );
}
