"use client";

import { useMemo, useState } from "react";
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
type SortField = "name" | "manufacturer" | "category" | "date" | "rating";

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

const SORT_COLS: { key: SortField; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "manufacturer", label: "Fabricante" },
  { key: "category", label: "Categoria" },
  { key: "date", label: "Data" },
  { key: "rating", label: "Avaliação" },
];

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
    const ok = item.canEdit && (await duplicateItem(item.type, item.id, ownUserId));
    if (ok) {
      onCatalogChanged();
      showToast("Item duplicado");
    } else showToast("Erro ao duplicar");
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
          {loading ? "Carregando…" : `${filtered.length} itens exibidos`}
        </div>
        {viewedProfile && (
          <div className="mt-0.5 text-[12.5px] font-semibold text-accent">
            Vendo perfil de {viewedProfile.name} · Somente visualização
          </div>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loading && filtered.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-muted">Nenhum item encontrado</div>
        ) : viewMode === "deck" ? (
          <DeckView
            items={filtered}
            onOpen={onOpenItem}
            onEdit={onEditItem}
            onDuplicate={doDuplicate}
            onDelete={setConfirmItem}
          />
        ) : viewMode === "table" ? (
          <TableView
            items={sorted}
            showActionsCol={sorted.some((i) => i.canEdit)}
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
            onOpen={onOpenItem}
            onDuplicate={doDuplicate}
            onDelete={setConfirmItem}
          />
        ) : (
          <GalleryView items={filtered} onOpen={onOpenItem} />
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
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-2.5"
        >
          <Thumb label={item.name} src={item.imgUrl} className="size-[72px] shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-extrabold">{item.name}</div>
            <div className="truncate text-[12.5px] text-muted">{item.manufacturer}</div>
            <div className="mt-1.5 flex items-center gap-2 text-[12.5px]">
              <Stars value={item.rating} />
              <span className="text-muted">{formatDate(item.date)}</span>
            </div>
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
          className="cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface"
        >
          <Thumb label={item.name} src={item.imgUrl} className="aspect-[3/4] w-full" />
          <div className="p-2.5">
            <div className="truncate text-[13px] font-bold">{item.name}</div>
            <div className="truncate text-[11px] text-muted">{item.manufacturer}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px]">
              <Stars value={item.rating} className="text-[11px]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
