"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { Accordion } from "@/components/ui";
import { fetchLibrary, type LibEntry } from "@/lib/library";

const cardCls = "rounded-2xl border border-border bg-surface p-4";

/** Biblioteca: conteúdo de referência (artigos/links) por tipo de bebida e grupo — aba `lib` da
 *  planilha (pedido do Carlos 2026-09-25). Filtro por bebida é montado a partir dos valores que
 *  existem de fato nos dados, não de um enum fixo — `lib_bebida` é texto livre na planilha. */
export default function LibraryScreen() {
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [bebida, setBebida] = useState<string>("todas");

  useEffect(() => {
    fetchLibrary()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  const bebidas = useMemo(() => {
    const set = new Set(entries.map((e) => e.bebida).filter(Boolean));
    return ["todas", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [entries]);

  const filtered = useMemo(
    () => (bebida === "todas" ? entries : entries.filter((e) => e.bebida === bebida)),
    [entries, bebida],
  );

  const groups = useMemo(() => {
    const byGrupo = new Map<string, LibEntry[]>();
    for (const e of filtered) {
      const key = e.grupo || "Outros";
      if (!byGrupo.has(key)) byGrupo.set(key, []);
      byGrupo.get(key)!.push(e);
    }
    return Array.from(byGrupo.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-6">
      {bebidas.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {bebidas.map((b) => (
            <button
              key={b}
              onClick={() => setBebida(b)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold capitalize transition ${
                bebida === b
                  ? "border-accent bg-accent text-on-accent"
                  : "border-border text-muted"
              }`}
            >
              {b === "todas" ? "Todas" : b}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="py-16 text-center text-[13px] text-muted">Carregando…</div>}

      {!loading && groups.length === 0 && (
        <div className="py-16 text-center text-[13px] text-muted">Nenhum conteúdo encontrado.</div>
      )}

      {!loading &&
        groups.map(([grupo, items]) => (
          <div key={grupo} className={cardCls}>
            <Accordion title={grupo} count={items.length} defaultOpen={groups.length === 1}>
              <div className="flex flex-col divide-y divide-border">
                {items.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                    <div className="flex items-center gap-2">
                      <Icon
                        name={item.link ? "link" : "book"}
                        size={15}
                        className="shrink-0 text-accent"
                      />
                      <div className="min-w-0 flex-1 text-[13.5px] font-bold">{item.titulo}</div>
                    </div>
                    {item.descricao && (
                      <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                        {item.descricao}
                      </div>
                    )}
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[12.5px] font-semibold text-accent"
                      >
                        {item.link}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Accordion>
          </div>
        ))}
    </div>
  );
}
