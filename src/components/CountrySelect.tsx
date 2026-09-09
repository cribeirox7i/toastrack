"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import PickerModal from "@/components/PickerModal";

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
 * Seletor de país. O gatilho mostra a bandeira + nome; a escolha acontece num `PickerModal` em
 * tela cheia, com busca no topo (pedido do Carlos 2026-09-09: padronizar as dropdowns de inclusão
 * como lista em tela cheia). `value` é o `pais_id` como string ("" = nenhum).
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
  const sel = options.find((p) => String(p.pais_id) === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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

      <PickerModal
        open={open}
        title="País"
        value={value}
        clearLabel="- sem país"
        onClose={() => setOpen(false)}
        onPick={onChange}
        options={options.map((p) => ({
          key: String(p.pais_id),
          label: p.pais_nome,
          left: <CountryFlag src={p.pais_img} />,
        }))}
      />
    </>
  );
}
