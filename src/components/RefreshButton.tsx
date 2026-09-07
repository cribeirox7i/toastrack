"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { refreshAllWithMessage } from "@/lib/refreshAll";

/**
 * Botão de "atualizar agora" pra barra superior, ao lado da foto de perfil. Faz a mesma
 * reconciliação completa que o puxar-pra-baixo (`refreshAllWithMessage`): pega inclusões, edições
 * e exclusões feitas fora do app - a mensagem de retorno é obrigatória (ver o helper).
 *
 * Continua existindo junto do gesto porque no desktop não há "puxar pra baixo", e no mobile é um
 * atalho quando a lista está rolada pro meio.
 */
export default function RefreshButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      setMsg(await refreshAllWithMessage());
      window.setTimeout(() => setMsg(""), 5000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        aria-label="Atualizar dados"
        title="Atualizar dados"
        className={`flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted disabled:opacity-60 ${className}`}
      >
        <Icon name="refresh" size={16} className={busy ? "animate-spin" : ""} />
      </button>
      {msg && (
        <div className="fixed bottom-20 left-1/2 z-40 max-w-[90vw] -translate-x-1/2 rounded-full bg-text px-4 py-2 text-center text-[13px] font-semibold text-bg shadow-lg">
          {msg}
        </div>
      )}
    </>
  );
}
