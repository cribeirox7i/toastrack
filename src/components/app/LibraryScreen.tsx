"use client";

import { useEffect, useMemo, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { Accordion } from "@/components/ui";
import { fetchLibrary, driveFileId, type LibEntry } from "@/lib/library";
import { LibraryViewer } from "@/components/app/LibraryViewer";

const cardCls = "rounded-2xl border border-border bg-surface p-4";

/** Lista canônica de grupos (pedido do Carlos 2026-09-25) — define ordem de exibição e ícone; só
 *  esses 5 vão existir por enquanto. Um `lib_grupo` fora dessa lista ainda funciona (cai no fim,
 *  com ícone genérico), só não tem tratamento visual dedicado. */
const GRUPO_ORDEM = ["Catálogos", "Livros", "Revistas", "Videos", "Sites"];
const GRUPO_ICON: Record<string, IconName> = {
  Catálogos: "folder",
  Livros: "book",
  Revistas: "newspaper",
  Videos: "play",
  Sites: "globe",
};

function ordemGrupo(nome: string): number {
  const i = GRUPO_ORDEM.indexOf(nome);
  return i === -1 ? GRUPO_ORDEM.length : i;
}

/** Biblioteca: conteúdo de referência por tipo de bebida e grupo — aba `lib` da planilha. Nunca
 *  mostra a URL crua: um item com link do Drive abre no visualizador embutido (PDF/imagem) ou
 *  oferece baixar (DOCX/XLSX) — ver LibraryViewer, que também recusa qualquer outro tipo de
 *  arquivo. Um link que não é do Drive é um site comum e abre numa aba externa. Filtro por bebida
 *  é montado a partir dos valores que existem de fato nos dados, não de um enum fixo. */
export default function LibraryScreen() {
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [bebida, setBebida] = useState<string>("todas");
  const [viewer, setViewer] = useState<{ fileId: string; titulo: string } | null>(null);

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
    return Array.from(byGrupo.entries()).sort((a, b) => ordemGrupo(a[0]) - ordemGrupo(b[0]));
  }, [filtered]);

  function abrirItem(item: LibEntry) {
    if (!item.link) return; // só texto — nada pra abrir
    const fileId = driveFileId(item.link);
    if (fileId) {
      setViewer({ fileId, titulo: item.titulo });
    } else {
      window.open(item.link, "_blank", "noopener,noreferrer");
    }
  }

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
            <Accordion
              title={grupo}
              count={items.length}
              defaultOpen={groups.length === 1}
              icon={GRUPO_ICON[grupo]}
            >
              <div className="flex flex-col divide-y divide-border">
                {items.map((item) => {
                  const clicavel = Boolean(item.link);
                  return (
                    <div key={item.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                      {clicavel ? (
                        <button
                          onClick={() => abrirItem(item)}
                          className="flex items-center gap-2 text-left"
                        >
                          <div className="min-w-0 flex-1 text-[13.5px] font-bold text-accent">
                            {item.titulo}
                          </div>
                          <Icon name="chevronDown" size={14} className="shrink-0 -rotate-90 text-muted" />
                        </button>
                      ) : (
                        <div className="text-[13.5px] font-bold">{item.titulo}</div>
                      )}
                      {item.descricao && (
                        <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                          {item.descricao}
                        </div>
                      )}
                      {!item.link && !item.descricao && (
                        <div className="text-[12.5px] text-muted">Sem conteúdo cadastrado ainda.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Accordion>
          </div>
        ))}

      {viewer && (
        <LibraryViewer fileId={viewer.fileId} titulo={viewer.titulo} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}
