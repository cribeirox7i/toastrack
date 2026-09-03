"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Stars, Thumb, formatDate } from "@/components/ui";
import { initialsFor } from "@/lib/utils";
import { useCatalog } from "@/components/CatalogProvider";
import {
  deleteItem,
  duplicateItem,
  TYPE_LABELS,
  type Item,
  type ItemType,
} from "@/lib/catalog";
import type { SecondaryProfile } from "@/lib/profiles";

type ViewMode = "deck" | "table" | "gallery";
type SearchField = "all" | "name" | "manufacturer" | "country";
type SortField = "name" | "manufacturer" | "category" | "date" | "rating" | "id";

const SEARCH_FIELDS: { value: SearchField; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "name", label: "Nome" },
  { value: "manufacturer", label: "Fabricante" },
  { value: "country", label: "País" },
];

const VIEW_MODES: { key: ViewMode; icon: string; label: string }[] = [
  { key: "deck", icon: "deck", label: "Deck" },
  { key: "table", icon: "table", label: "Tabela" },
  { key: "gallery", icon: "gallery", label: "Galeria" },
];

// Usado pelos cabeçalhos da Tabela — precisa bater 1:1 com as colunas fixas renderizadas ali
// embaixo (TableView), por isso "id" não entra aqui (a Tabela não tem coluna de id pra mostrar).
const SORT_COLS: { key: SortField; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "manufacturer", label: "Fabricante" },
  { key: "category", label: "Categoria" },
  { key: "date", label: "Data" },
  { key: "rating", label: "Avaliação" },
];

// Usado pelo menu "Ordenar" ao lado da busca — vale pras 3 visões (Deck/Tabela/Galeria), então
// pode ter uma opção a mais que a Tabela não expõe como coluna.
const SORT_MENU_COLS: { key: SortField; label: string }[] = [...SORT_COLS, { key: "id", label: "ID" }];

// Renderiza aos poucos em vez da lista inteira de uma vez — a aba `beer` tem ~3600 itens reais e
// as 3 visões (Deck/Tabela/Galeria) fazem .map() direto sobre o array inteiro, sem paginação
// nenhuma; montar ~3600 linhas de DOM do zero é o que fica lento (o Carlos reportou 2026-09-02:
// "clico no botão voltar, demora muito pra voltar" ao sair do Detalhe de uma cerveja — não é
// rede/cache, ListScreen desmonta e remonta ao trocar de tela, então essas ~3600 linhas são
// reconstruídas na hora). wine/dest/drink têm poucas dezenas de itens, nunca sentem isso.
const PAGE_SIZE = 60;

function matchesSearch(item: Item, field: SearchField, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const fields =
    field === "all"
      ? [item.name, item.manufacturer, item.country]
      : field === "name"
        ? [item.name]
        : field === "manufacturer"
          ? [item.manufacturer]
          : [item.country];
  return fields.some((f) => f.toLowerCase().includes(needle));
}

export default function ListScreen({
  listType,
  ownUserId,
  ownName,
  secondaryProfiles,
  viewedProfileId,
  onSelectProfile,
  onOpenProfile,
  onOpenItem,
  onEditItem,
  onAddItem,
  onCatalogChanged,
}: {
  listType: ItemType;
  ownUserId: string;
  ownName: string;
  secondaryProfiles: SecondaryProfile[];
  viewedProfileId: string | null;
  onSelectProfile: (id: string | null) => void;
  onOpenProfile: () => void;
  onOpenItem: (item: Item) => void;
  onEditItem: (item: Item) => void;
  onAddItem: () => void;
  onCatalogChanged: () => void;
}) {
  const isOwnView = !viewedProfileId || viewedProfileId === ownUserId;
  const hasSecondary = secondaryProfiles.length > 0;
  const viewedProfile = secondaryProfiles.find((p) => p.id === viewedProfileId) ?? null;

  const { catalog, loading } = useCatalog();
  const items = catalog[listType];
  const [viewMode, setViewMode] = useState<ViewMode>("deck");
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [confirmItem, setConfirmItem] = useState<Item | null>(null);
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }

  const filtered = useMemo(
    () => items.filter((i) => matchesSearch(i, searchField, query.trim())),
    [items, searchField, query],
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "rating") {
        av = a.rating;
        bv = b.rating;
      } else if (sortField === "date") {
        av = a.date;
        bv = b.date;
      } else {
        av = (a[sortField] || "").toLowerCase();
        bv = (b[sortField] || "").toLowerCase();
      }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  // Quantos itens de `sorted` de fato viram DOM agora — cresce de PAGE_SIZE em PAGE_SIZE
  // conforme o usuário rola (ver sentinela mais abaixo), reseta quando a lista muda de baixo
  // (busca/ordenação/visão/categoria), senão "carregar mais" ficaria preso num ponto que não
  // existe mais no resultado novo. Ajuste durante o render (padrão recomendado do React pra
  // "resetar estado quando algo muda") em vez de um efeito, pra não disparar setState fora da
  // renderização por um valor que já dava pra saber na hora.
  const resetKey = `${listType}|${query}|${searchField}|${sortField}|${sortDir}|${viewMode}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setVisibleCount(PAGE_SIZE);
  }
  const visibleItems = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, sorted.length));
        }
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [sorted.length]);

  // "Início da lista" / "Fim da lista" flutuantes (pedido do Carlos 2026-09-02, mesma ideia do
  // botão de "ir pro fim" do WhatsApp) - só aparecem depois de rolar uma distância razoável, não
  // no primeiro pixel de scroll.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [showJumpTop, setShowJumpTop] = useState(false);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const SCROLL_JUMP_THRESHOLD = 480;

  function handleBodyScroll() {
    const el = bodyRef.current;
    if (!el) return;
    setShowJumpTop(el.scrollTop > SCROLL_JUMP_THRESHOLD);
    setShowJumpBottom(el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_JUMP_THRESHOLD);
  }

  function jumpTo(edge: "top" | "bottom") {
    bodyRef.current?.scrollTo({ top: edge === "top" ? 0 : bodyRef.current.scrollHeight, behavior: "smooth" });
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  async function doDelete(item: Item) {
    setConfirmItem(null);
    const ok = item.canEdit && (await deleteItem(item.type, item.id));
    if (ok) {
      onCatalogChanged();
      showToast("Item excluído");
    } else showToast("Erro ao excluir");
  }

  async function doDuplicate(item: Item) {
    if (!item.canEdit) {
      showToast("Erro ao duplicar");
      return;
    }
    const newId = await duplicateItem(item.type, item.id, ownUserId);
    if (newId) {
      onCatalogChanged();
      // Abre a cópia direto em edição (pedido do Carlos 2026-09-02) - é raro duplicar um item e
      // querer ele idêntico ao original, então poupa o "abrir > Editar" manual de cada vez.
      onEditItem({ ...item, id: newId });
    } else {
      showToast("Erro ao duplicar");
    }
  }

  const activeProfileInitials = initialsFor(viewedProfile ? viewedProfile.name : ownName);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Header: search + field selector + avatar (mobile) */}
      <header className="flex items-center gap-2 border-b border-border px-5 py-2.5">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={17} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="w-full rounded-full border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        <select
          value={searchField}
          onChange={(e) => setSearchField(e.target.value as SearchField)}
          className="rounded-full border border-border bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-accent"
        >
          {SEARCH_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <button
            onClick={() => setSortMenuOpen((v) => !v)}
            title="Ordenar"
            aria-label="Ordenar"
            className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-2.5 text-[13px] font-semibold text-muted"
          >
            <Icon name="sort" size={15} />
            <span className="hidden sm:inline">
              {SORT_MENU_COLS.find((c) => c.key === sortField)?.label}
            </span>
          </button>
          {sortMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[190px] rounded-2xl border border-border bg-surface p-1.5 shadow-lg">
                {SORT_MENU_COLS.map((c) => {
                  const active = sortField === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => {
                        toggleSort(c.key);
                        setSortMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-semibold"
                      style={{ background: active ? "var(--accent-soft)" : "transparent" }}
                    >
                      <span className={active ? "text-accent" : ""}>{c.label}</span>
                      {active && (
                        <Icon
                          name="chevronDown"
                          size={14}
                          className={`text-accent transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <button
          onClick={onOpenProfile}
          aria-label="Perfil"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent sm:hidden"
        >
          {initialsFor(ownName)}
        </button>
      </header>

      {/* Row 2: profile switcher + view modes + add */}
      <div className="flex items-center gap-2 px-5 pt-3">
        {hasSecondary && (
          <>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full border py-1 pl-1 pr-2"
                style={{
                  borderColor: viewedProfile ? "var(--accent)" : "var(--border)",
                  background: viewedProfile ? "var(--accent-soft)" : "transparent",
                }}
              >
                <span className="flex size-[30px] items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
                  {activeProfileInitials}
                </span>
                <Icon name="chevronDown" size={14} className="text-muted" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-0 top-[calc(100%+6px)] z-20 min-w-[190px] rounded-2xl border border-border bg-surface p-1.5 shadow-lg">
                    <ProfileRow
                      initials={initialsFor(ownName)}
                      label={`${ownName} · meu perfil`}
                      selected={isOwnView}
                      onClick={() => {
                        onSelectProfile(null);
                        setMenuOpen(false);
                      }}
                    />
                    {secondaryProfiles.map((p) => (
                      <ProfileRow
                        key={p.id}
                        initials={initialsFor(p.name)}
                        label={p.name}
                        selected={viewedProfileId === p.id}
                        onClick={() => {
                          onSelectProfile(p.id);
                          setMenuOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="h-6 w-px bg-border" />
          </>
        )}

        {VIEW_MODES.map((vm) => {
          const active = viewMode === vm.key;
          return (
            <button
              key={vm.key}
              onClick={() => setViewMode(vm.key)}
              title={vm.label}
              className="flex h-[38px] w-10 items-center justify-center rounded-[10px] border"
              style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <Icon name={vm.icon} size={19} />
            </button>
          );
        })}

        {isOwnView && (
          <>
            <div className="h-6 w-px bg-border" />
            <button
              onClick={onAddItem}
              title="Adicionar"
              className="flex size-[38px] items-center justify-center rounded-[10px] bg-accent text-on-accent"
            >
              <Icon name="plus" size={18} strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>

      {/* Count + view-only badge */}
      <div className="px-5 pb-1 pt-2">
        <div className="text-[12.5px] text-muted">
          {loading
            ? "Carregando…"
            : visibleCount < filtered.length
              ? `${visibleCount} de ${filtered.length} itens exibidos`
              : `${filtered.length} itens exibidos`}
        </div>
        {viewedProfile && (
          <div className="mt-0.5 text-[12.5px] font-semibold text-accent">
            Vendo perfil de {viewedProfile.name} · Somente visualização
          </div>
        )}
      </div>

      {/* Body */}
      <div ref={bodyRef} onScroll={handleBodyScroll} className="min-h-0 flex-1 overflow-y-auto">
        {!loading && filtered.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-muted">Nenhum item encontrado</div>
        ) : viewMode === "deck" ? (
          <DeckView
            items={visibleItems}
            onOpen={onOpenItem}
            onEdit={onEditItem}
            onDuplicate={doDuplicate}
            onDelete={setConfirmItem}
          />
        ) : viewMode === "table" ? (
          <TableView
            items={visibleItems}
            showActionsCol={sorted.some((i) => i.canEdit)}
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
            onOpen={onOpenItem}
            onDuplicate={doDuplicate}
            onDelete={setConfirmItem}
          />
        ) : (
          <GalleryView items={visibleItems} onOpen={onOpenItem} />
        )}
        {!loading && visibleCount < sorted.length && (
          <div ref={sentinelRef} className="py-6 text-center text-[12.5px] text-muted">
            Carregando mais…
          </div>
        )}
      </div>

      {/* Início/Fim da lista - só depois de rolar uma distância razoável */}
      <div className="pointer-events-none fixed bottom-20 right-4 z-20 flex flex-col items-end gap-2">
        {showJumpTop && (
          <button
            onClick={() => jumpTo("top")}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-[12.5px] font-bold text-text shadow-lg"
          >
            <Icon name="chevronDown" size={13} className="rotate-180" />
            Início da lista
          </button>
        )}
        {showJumpBottom && (
          <button
            onClick={() => jumpTo("bottom")}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-[12.5px] font-bold text-text shadow-lg"
          >
            Fim da lista
            <Icon name="chevronDown" size={13} />
          </button>
        )}
      </div>

      {/* Delete confirm */}
      {confirmItem && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-5 text-center">
            <div className="text-[15px] font-bold">Excluir item?</div>
            <div className="mt-1 text-[13px] text-muted">{confirmItem.name}</div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmItem(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => void doDelete(confirmItem)}
                className="flex-1 rounded-xl bg-danger py-2.5 text-[13px] font-bold text-white"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-text px-4 py-2 text-[13px] font-semibold text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ProfileRow({
  initials,
  label,
  selected,
  onClick,
}: {
  initials: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left"
      style={{ background: selected ? "var(--accent-soft)" : "transparent" }}
    >
      <span className="flex size-[30px] items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
        {initials}
      </span>
      <span className="flex-1 truncate text-[13px] font-semibold">{label}</span>
      {selected && <Icon name="check" size={15} className="text-accent" strokeWidth={2.5} />}
    </button>
  );
}

function RowActions({
  item,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  item: Item;
  onEdit: (i: Item) => void;
  onDuplicate: (i: Item) => void;
  onDelete: (i: Item) => void;
}) {
  const base =
    "flex size-7 items-center justify-center rounded-lg border border-border text-muted";
  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onEdit(item)} className={base} title="Editar">
        <Icon name="edit" size={13} />
      </button>
      <button onClick={() => onDuplicate(item)} className={base} title="Duplicar">
        ⧉
      </button>
      <button
        onClick={() => onDelete(item)}
        className="flex size-7 items-center justify-center rounded-lg border border-danger text-danger"
        title="Excluir"
      >
        ✕
      </button>
    </div>
  );
}

function DeckView({
  items,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  items: Item[];
  onOpen: (i: Item) => void;
  onEdit: (i: Item) => void;
  onDuplicate: (i: Item) => void;
  onDelete: (i: Item) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2.5 px-5 py-3">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onOpen(item)}
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm transition active:scale-[0.99]"
        >
          <Thumb label={item.name} src={item.imgUrl} className="size-[92px] shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15.5px] font-extrabold">{item.name}</div>
            <div className="truncate text-[12.5px] text-muted">{item.manufacturer}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {item.category && (
                <span className="max-w-[9.5rem] truncate rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold text-accent">
                  {item.category}
                </span>
              )}
              <span className="flex items-center gap-1 rounded-full bg-track px-2 py-0.5 text-[11px] font-bold">
                <span className="text-accent">★</span>
                {item.rating.toFixed(1)}
              </span>
            </div>
            <div className="mt-1.5 text-[11.5px] text-muted">{formatDate(item.date)}</div>
          </div>
          {item.canEdit && (
            <RowActions item={item} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
          )}
        </div>
      ))}
    </div>
  );
}

function TableView({
  items,
  showActionsCol,
  sortField,
  sortDir,
  onSort,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  items: Item[];
  showActionsCol: boolean;
  sortField: SortField;
  sortDir: "asc" | "desc";
  onSort: (f: SortField) => void;
  onOpen: (i: Item) => void;
  onDuplicate: (i: Item) => void;
  onDelete: (i: Item) => void;
}) {
  const arrow = (f: SortField) => (sortField === f ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  return (
    <div className="w-full overflow-x-auto px-5 py-3">
      <div className="min-w-[560px]">
        <div className="flex items-center rounded-t-xl bg-track text-[12px] font-bold text-muted">
          {SORT_COLS.map((c) => (
            <button
              key={c.key}
              onClick={() => onSort(c.key)}
              className={`px-3 py-2.5 text-left ${c.key === "name" ? "flex-[2]" : "flex-1"}`}
            >
              {c.label}
              {arrow(c.key)}
            </button>
          ))}
          {showActionsCol && <div className="w-20 px-3 py-2.5 text-right">Ações</div>}
        </div>
        {items.map((item) => (
          <div key={item.id} className="flex items-center border-b border-border text-[13px]">
            <button
              onClick={() => onOpen(item)}
              className="flex-[2] truncate px-3 py-2.5 text-left font-semibold"
            >
              {item.name}
            </button>
            <div className="flex-1 truncate px-3 py-2.5 text-muted">{item.manufacturer}</div>
            <div className="flex-1 truncate px-3 py-2.5 text-muted">{item.category}</div>
            <div className="flex-1 px-3 py-2.5 text-muted">{formatDate(item.date)}</div>
            <div className="flex-1 px-3 py-2.5">
              <Stars value={item.rating} className="text-[12px]" />
            </div>
            {showActionsCol && (
              <div className="flex w-20 justify-end gap-1 px-3 py-2.5">
                {item.canEdit && (
                  <>
                    <button
                      onClick={() => onDuplicate(item)}
                      className="flex size-6 items-center justify-center rounded border border-border text-muted"
                      title="Duplicar"
                    >
                      ⧉
                    </button>
                    <button
                      onClick={() => onDelete(item)}
                      className="flex size-6 items-center justify-center rounded border border-danger text-danger"
                      title="Excluir"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GalleryView({ items, onOpen }: { items: Item[]; onOpen: (i: Item) => void }) {
  return (
    <div
      className="mx-auto grid w-full max-w-3xl gap-3 px-5 py-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onOpen(item)}
          className="cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition active:scale-[0.99]"
        >
          <div className="relative">
            <Thumb label={item.name} src={item.imgUrl} className="aspect-[3/4] w-full" />
            <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-bold shadow-sm backdrop-blur-sm">
              <span className="text-accent">★</span>
              {item.rating.toFixed(1)}
            </span>
          </div>
          <div className="p-2.5">
            <div className="truncate text-[13px] font-bold">{item.name}</div>
            <div className="truncate text-[11px] text-muted">{item.manufacturer}</div>
            {item.category && (
              <span className="mt-1.5 inline-block max-w-full truncate rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                {item.category}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
