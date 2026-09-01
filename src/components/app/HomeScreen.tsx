"use client";

import { useEffect, useMemo, useState } from "react";
import { useCatalog } from "@/components/CatalogProvider";
import Icon from "@/components/Icon";
import { Thumb, Stars, formatDate } from "@/components/ui";
import { TYPE_LABELS, type Item, type ItemType, type Catalog } from "@/lib/catalog";

const OVERVIEW_ORDER: ItemType[] = ["beer", "wine", "drink", "spirit"];

function pickRandom<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

/** Featured: one beer, one wine, one drink-or-spirit (spec D.2). Skips empties. */
function buildFeatured(catalog: Catalog): Item[] {
  const third = [...catalog.drink, ...catalog.spirit];
  return [pickRandom(catalog.beer), pickRandom(catalog.wine), pickRandom(third)].filter(
    (x): x is Item => x != null,
  );
}

function searchCatalog(catalog: Catalog, query: string): Item[] {
  const q = query.trim().toLowerCase();
  const all = [...catalog.beer, ...catalog.wine, ...catalog.drink, ...catalog.spirit];
  return all.filter((i) =>
    [i.name, i.manufacturer, i.country, i.category].some((f) => f.toLowerCase().includes(q)),
  );
}

const sectionLabel = "mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted";

export default function HomeScreen({
  searchQuery,
  onOpenStats,
  onOpenItem,
}: {
  searchQuery: string;
  onOpenStats: (type: ItemType) => void;
  onOpenItem: (item: Item) => void;
}) {
  const { catalog, loading } = useCatalog();
  const searching = searchQuery.trim().length > 0;

  const slides = useMemo(() => buildFeatured(catalog), [catalog]);
  const [idx, setIdx] = useState(0);

  // Auto-advance the carousel every 4s.
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

  useEffect(() => {
    if (idx >= slides.length) setIdx(0);
  }, [slides.length, idx]);

  const results = useMemo(
    () => (searching ? searchCatalog(catalog, searchQuery) : []),
    [searching, catalog, searchQuery],
  );

  if (searching) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-4">
        <div className="mb-3 text-[12.5px] text-muted">
          {results.length} {results.length === 1 ? "resultado" : "resultados"}
        </div>
        <div className="flex flex-col gap-2.5">
          {results.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => onOpenItem(item)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 text-left"
            >
              <Thumb label={item.name} src={item.imgUrl} className="size-12 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase text-accent">
                  {TYPE_LABELS[item.type]}
                </div>
                <div className="truncate text-[14px] font-bold">{item.name}</div>
                <div className="truncate text-[12px] text-muted">
                  {item.manufacturer}
                  {item.country ? ` · ${item.country}` : ""}
                </div>
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <div className="py-16 text-center text-[14px] text-muted">Nenhum item encontrado</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-8 pt-4">
      {/* Featured carousel */}
      <section className="mb-6">
        <div className={sectionLabel}>Destaque do dia</div>
        {slides.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border text-[13px] text-muted">
            {loading ? "Carregando…" : "Adicione itens para ver destaques aqui."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {slides.map(
              (slide, i) =>
                i === idx && (
                  <div key={`${slide.type}-${slide.id}`} className="flex gap-4 p-4">
                    <Thumb label={slide.name} src={slide.imgUrl} className="h-32 w-28 shrink-0 rounded-xl" />
                    <div className="flex min-w-0 flex-col justify-center">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-accent">
                        {TYPE_LABELS[slide.type]}
                      </div>
                      <div className="mt-1 truncate text-[19px] font-extrabold">{slide.name}</div>
                      <div className="mt-1 truncate text-[13px] text-muted">
                        {slide.manufacturer}
                        {slide.category ? ` · ${slide.category}` : ""}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[12.5px]">
                        <Stars value={slide.rating} />
                        <span className="text-muted">{formatDate(slide.date)}</span>
                      </div>
                    </div>
                  </div>
                ),
            )}
            <div className="flex justify-center gap-1.5 pb-3">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Slide ${i + 1}`}
                  className="size-2 rounded-full transition"
                  style={{ background: i === idx ? "var(--accent)" : "var(--border)" }}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Overview */}
      <section>
        <div className={sectionLabel}>Visão geral</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {OVERVIEW_ORDER.map((type) => (
            <button
              key={type}
              onClick={() => onOpenStats(type)}
              className="flex flex-col items-start rounded-2xl border border-border bg-surface p-4 text-left transition active:scale-[.98]"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon name={type} size={20} />
              </div>
              <div className="mt-2.5 text-[28px] font-extrabold leading-none">
                {catalog[type].length}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-muted">{TYPE_LABELS[type]}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
