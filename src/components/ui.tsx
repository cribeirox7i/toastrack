"use client";

/** Small shared UI primitives used across screens. */

import { useState } from "react";

/** Read-only 5-star row supporting halves (0–5, 0.5 steps) via a clipped overlay. */
export function Stars({ value, className = "text-[13px]" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span
      className={`relative inline-block leading-none ${className}`}
      aria-label={`${value} de 5 estrelas`}
    >
      <span className="text-border">★★★★★</span>
      <span
        className="absolute left-0 top-0 overflow-hidden text-accent"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      >
        ★★★★★
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
