import { canEditRow } from "@/lib/itemPermissions";

export type ItemType = "beer" | "wine" | "drink" | "spirit";

/** Normalized item used across the UI (each catalog table maps into this shape). */
export type Item = {
  id: string;
  type: ItemType;
  name: string;
  manufacturer: string;
  country: string; // pais_nome, or ""
  rating: number; // 0–5
  date: string; // "YYYY-MM-DD" or ""
  category: string; // beer: BJCP label · wine: cor · spirit: tipo · drink: ""
  /** Dono ou listado em user_edit — item compartilhado só por user_access dá false. */
  canEdit: boolean;
};

export type Catalog = Record<ItemType, Item[]>;

export const EMPTY_CATALOG: Catalog = { beer: [], wine: [], drink: [], spirit: [] };

export const TYPE_LABELS: Record<ItemType, string> = {
  beer: "Cervejas",
  wine: "Vinhos",
  drink: "Drinks",
  spirit: "Destilados",
};

export const TYPE_LABEL_SINGULAR: Record<ItemType, string> = {
  beer: "Cerveja",
  wine: "Vinho",
  drink: "Drink",
  spirit: "Destilado",
};

/** A UI usa "spirit" (nome histórico, já espalhado pelas telas); a aba/rota real é "dest" — ver
 *  MIGRACAO_SHEETS.md seção 3. Esta é a única fronteira onde a tradução acontece. */
export const TYPE_TAB: Record<ItemType, string> = {
  beer: "beer",
  wine: "wine",
  spirit: "dest",
  drink: "drink",
};

type RawItemRow = Record<string, string | undefined>;

type TypeCfg = {
  nameCol: string;
  manufacturerCol: string;
  ratingCol: string;
  dateCol: string;
  categoryCol?: string; // undefined = sem categoria (drink)
};

const CONFIG: Record<ItemType, TypeCfg> = {
  beer: { nameCol: "beer_nome", manufacturerCol: "beer_cervejaria", ratingCol: "beer_nota", dateCol: "beer_data", categoryCol: "beer_estilo_livre" },
  wine: { nameCol: "wine_nome", manufacturerCol: "wine_produtor", ratingCol: "wine_nota", dateCol: "wine_data_degustacao", categoryCol: "wine_cor" },
  spirit: { nameCol: "dest_nome", manufacturerCol: "dest_produtor", ratingCol: "dest_nota", dateCol: "dest_data_degustacao", categoryCol: "dest_tipo" },
  drink: { nameCol: "drink_nome", manufacturerCol: "drink_produtor", ratingCol: "drink_nota", dateCol: "drink_data_degustacao" },
};

// país vem só como pais_id na linha crua; o nome é resolvido à parte via /api/lookups, porque a
// rota de itens não faz join (o Apps Script não sabe fazer join entre abas).
function mapRow(type: ItemType, row: RawItemRow, paisNome: (id: string) => string, userId: string): Item {
  const cfg = CONFIG[type];
  return {
    id: row.id ?? "",
    type,
    name: row[cfg.nameCol] ?? "",
    manufacturer: row[cfg.manufacturerCol] ?? "",
    country: paisNome(row.pais_id ?? ""),
    rating: Number(row[cfg.ratingCol]) || 0,
    date: row[cfg.dateCol] ?? "",
    category: cfg.categoryCol ? (row[cfg.categoryCol] ?? "") : "",
    canEdit: canEditRow(row, userId),
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/** Nome de país por id — busca as 40 linhas de /api/lookups uma vez por chamada. Aceitável pro
 *  volume de países; se virar hotspot, dá pra levar pro CatalogProvider e cachear por sessão. */
async function paisNomeResolver(): Promise<(id: string) => string> {
  const lk = await getJson<{ paises: { pais_id: string; pais_nome: string }[] }>("/api/lookups");
  const map = new Map((lk?.paises ?? []).map((p) => [String(p.pais_id), p.pais_nome]));
  return (id: string) => map.get(id) ?? "";
}

/** Carrega uma categoria (itens visíveis pra sessão — dono, ou em user_access/user_edit).
 *  `userId` só serve pra calcular `Item.canEdit` no cliente — a rota já filtra por sessão sozinha. */
export async function fetchItems(type: ItemType, userId: string): Promise<Item[]> {
  const [rows, paisNome] = await Promise.all([
    getJson<RawItemRow[]>(`/api/items/${TYPE_TAB[type]}`),
    paisNomeResolver(),
  ]);
  const items = (rows ?? []).map((r) => mapRow(type, r, paisNome, userId));
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items;
}

export async function deleteItem(type: ItemType, id: string): Promise<boolean> {
  const res = await fetch(`/api/items/${TYPE_TAB[type]}/${id}`, { method: "DELETE" });
  return res.ok;
}

/** Duplica um item: lê a linha inteira, tira id/dono/updated_at (a rota de criação recalcula) e
 *  recria — sai sempre como item seu, mesmo duplicando um item compartilhado com você. */
export async function duplicateItem(type: ItemType, id: string): Promise<boolean> {
  const row = await getJson<Record<string, string>>(`/api/items/${TYPE_TAB[type]}/${id}`);
  if (!row) return false;
  const { id: _id, user_owner: _owner, user_access: _access, user_edit: _edit, updated_at: _ts, ...payload } = row;
  void _id; void _owner; void _access; void _edit; void _ts;
  const res = await fetch(`/api/items/${TYPE_TAB[type]}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

/** Carrega as 4 categorias de uma vez (itens visíveis pro usuário logado). */
export async function fetchCatalog(userId: string): Promise<Catalog> {
  const [beer, wine, drink, spirit] = await Promise.all([
    fetchItems("beer", userId),
    fetchItems("wine", userId),
    fetchItems("drink", userId),
    fetchItems("spirit", userId),
  ]);
  return { beer, wine, drink, spirit };
}
