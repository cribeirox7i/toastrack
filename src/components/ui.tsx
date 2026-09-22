"use client";

/** Small shared UI primitives used across screens. */

import { useState } from "react";
import { initialsFor } from "@/lib/utils";

/** Avatar de usuário: foto (`url`) quando existir, senão as iniciais no círculo de accent. O
 *  tamanho e o tamanho da fonte das iniciais vêm por `className` (ex.: "size-9 text-[13px]").
 *  Mesmo padrão de reset-no-render do `Thumb` pra uma foto trocada voltar a ser tentada. */
export function Avatar({ url, name, className = "" }: { url?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setFailed(false);
  }
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent ${className}`}
    >
      {initialsFor(name)}
    </span>
  );
}

/** Read-only star row, preenchimento contínuo por `%` (suporta fração, ex.: média). `max` é o
 *  teto real da nota (5 pra cerveja/destilado/drink, 100 pra vinho) e `starCount` é quantas
 *  estrelas a UI desenha (5 pra cerveja, 10 pra vinho - cada uma valendo `max/starCount` pontos,
 *  ver `RATING_SCALE` em itemSchema.ts, pedido do Carlos 2026-09-22). */
export function Stars({
  value,
  max = 5,
  starCount = max,
  className = "text-[13px]",
}: {
  value: number;
  max?: number;
  starCount?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const stars = "★".repeat(starCount);
  return (
    <span
      className={`relative inline-block leading-none ${className}`}
      aria-label={`${value} de ${max}`}
    >
      <span className="text-border">{stars}</span>
      <span
        className="absolute left-0 top-0 overflow-hidden text-accent"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      >
        {stars}
      </span>
    </span>
  );
}

/** Foto real do item (src) quando existir, com fallback pro placeholder listrado — tanto pra
 *  item sem foto (src vazio) quanto pra link do Drive quebrado (onError). */
export function Thumb({ label, src, className = "" }: { label: string; src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  // Sem isto, uma foto que falhou uma vez (link quebrado, hiccup de rede) prendia este Thumb no
  // placeholder pra sempre - trocar `src` depois (ex.: anexar uma foto nova por cima da que
  // falhou) não voltava a tentar, porque `failed` só nasce false e nunca é resetado sozinho.
  // Ajuste de estado durante a renderização (padrão recomendado do React pra "resetar estado
  // quando uma prop muda"), não num efeito - evita o round-trip extra de render que um efeito
  // causaria aqui.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(false);
  }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={label}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center overflow-hidden p-1 text-center font-mono text-[8px] leading-tight text-muted ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--accent-soft) 0 10px, var(--border) 10px 20px)",
      }}
    >
      <span className="line-clamp-3">Foto: {label}</span>
    </div>
  );
}

/** "2026-06-01" -> "01/06/2026". Returns "" for empty/invalid. */
export function formatDate(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
