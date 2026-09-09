"use client";

import { useMemo, useState, type ReactNode } from "react";
import Icon from "@/components/Icon";

export interface PickerOption {
  key: string;
  /** Texto usado tanto pra exibir quanto pra casar na busca. */
  label: string;
  /** Enfeite à esquerda (ex.: bandeira do país). */
  left?: ReactNode;
}

/**
 * Seletor em TELA CHEIA com campo de busca no topo (pedido do Carlos 2026-09-09: padronizar as
 * dropdowns das telas de inclusão - país e BJCP - como lista em tela cheia, sempre com busca).
 * `<select>` nativo abre em tela cheia no Android mas não tem busca; o dropdown acoplado tem
 * busca mas estoura a largura da tela. Isto junta os dois.
 *
 * `value` é a `key` selecionada ("" = nenhuma). `clearLabel`, quando dado, mostra uma primeira
 * opção que devolve "".
 */
export default function PickerModal({
  open,
  title,
  options,
  value,
  onPick,
  onClose,
  clearLabel,
}: {
  open: boolean;
  title: string;
  options: PickerOption[];
  value: string;
  onPick: (key: string) => void;
  onClose: () => void;
  clearLabel?: string;
}) {
  const [q, setQ] = useState("");
  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n)) : options;
  }, [q, options]);

  if (!open) return null;

  function fechar() {
    setQ("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <button onClick={fechar} className="text-[13px] font-bold text-accent">
          ← Fechar
        </button>
        <span className="truncate text-[15px] font-extrabold">{title}</span>
      </header>
      <div className="border-b border-border p-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar…"
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {clearLabel && (
          <button
            onClick={() => {
              onPick("");
              fechar();
            }}
            className="block w-full rounded-lg px-3 py-3 text-left text-[14px] text-muted"
          >
            {clearLabel}
          </button>
        )}
        {filtrados.map((o) => {
          const ativo = o.key === value;
          return (
            <button
              key={o.key}
              onClick={() => {
                onPick(o.key);
                fechar();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-[14px] font-semibold"
              style={{ background: ativo ? "var(--accent-soft)" : "transparent" }}
            >
              {o.left}
              <span className={`min-w-0 flex-1 truncate ${ativo ? "text-accent" : ""}`}>{o.label}</span>
              {ativo && <Icon name="check" size={15} className="text-accent" strokeWidth={2.5} />}
            </button>
          );
        })}
        {filtrados.length === 0 && (
          <div className="py-10 text-center text-[13px] text-muted">Nada encontrado</div>
        )}
      </div>
    </div>
  );
}
