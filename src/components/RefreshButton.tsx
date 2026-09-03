"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { refreshAllNow } from "@/lib/offline/sync";

/**
 * Botão de "atualizar agora" pra barra superior, ao lado da foto de perfil (pedido do Carlos
 * 2026-09-03: o PWA no Android não tem o "puxar pra baixo" nativo). Faz uma reconciliação
 * completa (`refreshAllNow`): relê as 4 abas por inteiro, então pega qualquer mudança feita fora
 * do app — edição direta na planilha ou de outro aparelho — inclusive exclusões, que o delta
 * incremental (`readSince`) nunca traz.
 */
export default function RefreshButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await refreshAllNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      aria-label="Atualizar dados"
      title="Atualizar dados"
      className={`flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted disabled:opacity-60 ${className}`}
    >
      <Icon name="refresh" size={16} className={busy ? "animate-spin" : ""} />
    </button>
  );
}
