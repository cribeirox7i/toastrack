"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";

export interface PaisOpcao {
  pais_id: number;
  pais_nome: string;
  pais_img: string;
}

/** Bandeira do país (a URL vem de `list_pais.pais_img`, flagcdn). Sem URL, um retângulo neutro. */
export function CountryFlag({ src, className = "h-3.5 w-5" }: { src?: string; className?: string }) {
  if (!src) return <span className={`${className} shrink-0 rounded-[2px] bg-track`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" className={`${className} shrink-0 rounded-[2px] object-cover`} />;
}

/**
 * Seletor de país com bandeira (pedido do Carlos 2026-09-08: bandeira sempre que houver seleção ou
 * exibição de país). `<option>` nativo não renderiza imagem, então é um dropdown próprio - mesmo
 * padrão dos menus de ordenar/filtrar do ListScreen. `value` é o `pais_id` como string ("" = nenhum).
 */
export default function CountrySelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (paisId: string) => void;
  options: PaisOpcao[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = options.find((p) => String(p.pais_id) === value);

  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((p) => p.pais_nome.toLowerCase().includes(n)) : options;
  }, [q, options]);

  function fechar() {
    setOpen(false);
    setQ("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
      >
        {sel ? (
          <>
            <CountryFlag src={sel.pais_img} />
            <span className="flex-1 truncate text-left">{sel.pais_nome}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-muted">-</span>
        )}
        <Icon name="chevronDown" size={16} className="text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={fechar} />
          {/* min-w pra a lista respirar mesmo numa coluna estreita; max-w trava no viewport pra
              nunca empurrar a tela pro lado (relato do Carlos 2026-09-08). */}
          <div className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-72 w-full min-w-[200px] max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-lg">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar país…"
              className="mb-1 w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                onChange("");
                fechar();
              }}
              className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-muted"
            >
              - sem país
            </button>
            {filtrados.map((p) => {
              const ativo = String(p.pais_id) === value;
              return (
                <button
                  key={p.pais_id}
                  type="button"
                  onClick={() => {
                    onChange(String(p.pais_id));
                    fechar();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold"
                  style={{ background: ativo ? "var(--accent-soft)" : "transparent" }}
                >
                  <CountryFlag src={p.pais_img} />
                  <span className={`flex-1 truncate ${ativo ? "text-accent" : ""}`}>{p.pais_nome}</span>
                  {ativo && <Icon name="check" size={13} className="text-accent" strokeWidth={2.5} />}
                </button>
              );
            })}
            {filtrados.length === 0 && (
              <div className="py-3 text-center text-[12.5px] text-muted">Nenhum país</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
