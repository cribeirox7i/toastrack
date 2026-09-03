"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { refreshAllNow } from "@/lib/offline/sync";

const TAB_LABEL: Record<string, string> = {
  beer: "cervejas",
  wine: "vinhos",
  dest: "destilados",
  drink: "drinks",
};

/**
 * Botão de "atualizar agora" pra barra superior, ao lado da foto de perfil (pedido do Carlos
 * 2026-09-03: o PWA no Android não tem o "puxar pra baixo" nativo). Faz uma reconciliação
 * completa (`refreshAllNow`): relê as 4 abas por inteiro, então pega qualquer mudança feita fora
 * do app — edição direta na planilha ou de outro aparelho — inclusive exclusões, que o delta
 * incremental (`readSince`) nunca traz.
 *
 * Sempre termina com um aviso na tela dizendo quantos itens vieram (ou qual aba falhou). Sem
 * isso, "rodou 2 minutos e os dados continuam os mesmos" é indistinguível de "rodou e falhou em
 * silêncio" — foi exatamente o que aconteceu na primeira versão deste botão.
 */
export default function RefreshButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function flash(texto: string) {
    setMsg(texto);
    window.setTimeout(() => setMsg(""), 5000);
  }

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const results = await refreshAllNow();
      const falhas = results.filter((r) => r.erro);
      if (falhas.length) {
        flash(`Falha em ${falhas.map((f) => TAB_LABEL[f.tab] ?? f.tab).join(", ")}: ${falhas[0].erro}`);
      } else {
        const soma = (campo: "linhas" | "baixadas" | "apagadas") =>
          results.reduce((s, r) => s + r[campo], 0);
        const mudou = [
          soma("baixadas") ? `${soma("baixadas")} novos/alterados` : "",
          soma("apagadas") ? `${soma("apagadas")} removidos` : "",
        ].filter(Boolean);
        flash(
          `Atualizado · ${soma("linhas")} itens${mudou.length ? ` (${mudou.join(", ")})` : " · nada mudou"}`
        );
      }
    } catch (err) {
      flash(`Erro ao atualizar: ${err instanceof Error ? err.message : String(err)}`);
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
