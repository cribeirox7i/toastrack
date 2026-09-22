"use client";

import { useMemo } from "react";
import { useCatalog } from "@/components/CatalogProvider";
import { Stars } from "@/components/ui";
import { TYPE_LABELS, type ItemType } from "@/lib/catalog";
import { RATING_SCALE } from "@/lib/itemSchema";
import { fmtDecimalBR } from "@/lib/numberBR";
import { flagUrl } from "@/lib/flags";

const TYPES: ItemType[] = ["beer", "wine", "spirit", "drink"];

/**
 * Estatísticas de um país cruzando os 4 tipos de item (pedido do Carlos 2026-09-22) - clicando na
 * bandeira de um item (Detalhe) ou no ranking "Por país" do Stats. Identifica o país pelo NOME (o
 * mesmo que `Item.country` e `flagUrl` já usam em toda parte, ver StatsScreen) em vez de `pais_id`:
 * evita puxar `/api/lookups` só pra isto e casa 1:1 com o jeito que os rankings já agrupam.
 */
export default function CountryScreen({ countryName }: { countryName: string }) {
  const { catalog } = useCatalog();
  const flag = flagUrl(countryName);

  const rows = useMemo(() => {
    return TYPES.map((type) => {
      const items = catalog[type].filter((i) => i.country === countryName);
      const rated = items.filter((i) => i.rating > 0);
      const avg = rated.length ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : 0;
      return { type, count: items.length, avg };
    });
  }, [catalog, countryName]);

  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-4">
      {/* Topo: bandeira + nome do país (pedido do Carlos) */}
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-5 text-center">
        {flag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flag} alt="" className="h-11 w-16 rounded-md object-cover shadow-sm" />
        ) : (
          <span className="h-11 w-16 rounded-md bg-track" />
        )}
        <div className="text-[18px] font-extrabold">{countryName}</div>
        <div className="text-[12.5px] text-muted">
          {total} {total === 1 ? "item" : "itens"} no total
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {rows.map((r) => (
          <div
            key={r.type}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold">{TYPE_LABELS[r.type]}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Stars
                  value={r.avg}
                  max={RATING_SCALE[r.type].max}
                  starCount={RATING_SCALE[r.type].starCount}
                  className="text-[14px]"
                />
                <span className="text-[12px] text-muted">{r.avg ? fmtDecimalBR(r.avg) : "—"}</span>
              </div>
            </div>
            <div className="text-[22px] font-extrabold text-accent">{r.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
