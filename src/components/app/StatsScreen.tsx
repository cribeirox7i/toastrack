"use client";

import { useEffect, useMemo, useState } from "react";
import { useCatalog } from "@/components/CatalogProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Stars } from "@/components/ui";
import { TYPE_LABELS, type Item, type ItemType } from "@/lib/catalog";

type Group = { name: string; count: number };

function groupBy(items: Item[], pick: (i: Item) => string): Group[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const key = pick(it).trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

const sectionLabel = "mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-muted";

function RankSection({
  rows,
  flags,
}: {
  rows: Group[];
  flags?: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const max = rows[0]?.count ?? 1;
  const shown = expanded ? rows : rows.slice(0, 5);
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      {shown.map((r) => (
        <div key={r.name} className="flex items-center gap-2 py-1.5">
          {flags &&
            (flags.get(r.name) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={flags.get(r.name)} alt="" className="h-3.5 w-5 rounded-sm object-cover" />
            ) : (
              <span className="w-5" />
            ))}
          <div className="min-w-0 flex-1 truncate text-[13px] font-semibold">{r.name}</div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <div className="w-6 text-right text-[13px] font-bold text-muted">{r.count}</div>
        </div>
      ))}
      {rows.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 w-full py-1.5 text-[12.5px] font-bold text-accent"
        >
          {expanded ? "Ver menos" : `Ver tudo (${rows.length})`}
        </button>
      )}
      {rows.length === 0 && <div className="py-3 text-center text-[13px] text-muted">—</div>}
    </div>
  );
}

/** Stats drill-down for one category. Always scoped to the user's OWN items
 *  (catalog is own-only), ignoring any secondary profile selected elsewhere. */
export default function StatsScreen({ type }: { type: ItemType }) {
  const { catalog } = useCatalog();
  const items = catalog[type];
  const [flags, setFlags] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    getSupabaseClient()
      .from("list_pais")
      .select("pais_nome,pais_img")
      .then(({ data }) => {
        const m = new Map<string, string>();
        for (const p of (data ?? []) as { pais_nome: string; pais_img: string | null }[]) {
          if (p.pais_img) m.set(p.pais_nome, p.pais_img);
        }
        setFlags(m);
      });
  }, []);

  const { total, avg, byCountry, byCategory, byManufacturer } = useMemo(() => {
    const rated = items.filter((i) => i.rating > 0);
    const avgVal = rated.length
      ? rated.reduce((s, i) => s + i.rating, 0) / rated.length
      : 0;
    return {
      total: items.length,
      avg: avgVal,
      byCountry: groupBy(items, (i) => i.country),
      byCategory: groupBy(items, (i) => i.category),
      byManufacturer: groupBy(items, (i) => i.manufacturer),
    };
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-4">
      {/* Hero */}
      <div className="rounded-2xl border border-border bg-surface p-5 text-center">
        <div className="text-[40px] font-extrabold leading-none">{total}</div>
        <div className="mt-1 text-[13px] font-semibold text-muted">{TYPE_LABELS[type]}</div>
        <div className="mt-3 flex flex-col items-center gap-1">
          <Stars value={avg} className="text-[20px]" />
          <div className="text-[12px] text-muted">
            Média · {avg ? avg.toFixed(1) : "—"}
          </div>
        </div>
      </div>

      <div className={sectionLabel}>Por país</div>
      <RankSection rows={byCountry} flags={flags} />

      <div className={sectionLabel}>Por categoria</div>
      <RankSection rows={byCategory} />

      <div className={sectionLabel}>Por fabricante</div>
      <RankSection rows={byManufacturer} />
    </div>
  );
}
