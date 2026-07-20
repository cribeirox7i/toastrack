import { getSupabaseClient } from "@/lib/supabase/client";

export type ItemType = "beer" | "wine" | "drink" | "spirit";

/** Normalized item used across the UI (each catalog table maps into this shape). */
export type Item = {
  id: number;
  type: ItemType;
  name: string;
  manufacturer: string;
  country: string; // pais_nome, or ""
  rating: number; // 0–5
  date: string; // "YYYY-MM-DD" or ""
  category: string; // beer: BJCP label · wine: cor · spirit: tipo · drink: ""
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

// Per-type query config. `spirit` lives in the `dest` table.
type TypeCfg = {
  table: string;
  idCol: string;
  select: string;
  dateCol: string;
  map: (row: Record<string, unknown>) => Item;
};

/** Public per-type metadata (table + PK column) for CRUD by other modules. */
export const TYPE_TABLE: Record<ItemType, { table: string; idCol: string }> = {
  beer: { table: "beer", idCol: "beer_id" },
  wine: { table: "wine", idCol: "wine_id" },
  spirit: { table: "dest", idCol: "dest_id" },
  drink: { table: "drink", idCol: "drink_id" },
};

const num = (v: unknown): number => (v == null ? 0 : Number(v)) || 0;
const str = (v: unknown): string => (v == null ? "" : String(v));
const paisNome = (row: Record<string, unknown>): string => {
  const p = row.list_pais as { pais_nome?: string } | null | undefined;
  return p?.pais_nome ?? "";
};

const CONFIG: Record<ItemType, TypeCfg> = {
  beer: {
    table: "beer",
    idCol: "beer_id",
    select:
      "beer_id,beer_nome,beer_produtor,beer_nota,beer_data,list_pais(pais_nome),list_bjcp_21(bjcp21_cod)",
    dateCol: "beer_data",
    map: (r) => ({
      id: num(r.beer_id),
      type: "beer",
      name: str(r.beer_nome),
      manufacturer: str(r.beer_produtor),
      country: paisNome(r),
      rating: num(r.beer_nota),
      date: str(r.beer_data),
      category: str((r.list_bjcp_21 as { bjcp21_cod?: string } | null)?.bjcp21_cod),
    }),
  },
  wine: {
    table: "wine",
    idCol: "wine_id",
    select:
      "wine_id,wine_nome,wine_produtor,wine_nota,wine_data_degustacao,wine_cor,list_pais(pais_nome)",
    dateCol: "wine_data_degustacao",
    map: (r) => ({
      id: num(r.wine_id),
      type: "wine",
      name: str(r.wine_nome),
      manufacturer: str(r.wine_produtor),
      country: paisNome(r),
      rating: num(r.wine_nota),
      date: str(r.wine_data_degustacao),
      category: str(r.wine_cor),
    }),
  },
  spirit: {
    table: "dest",
    idCol: "dest_id",
    select:
      "dest_id,dest_nome,dest_produtor,dest_nota,dest_data_degustacao,dest_tipo,list_pais(pais_nome)",
    dateCol: "dest_data_degustacao",
    map: (r) => ({
      id: num(r.dest_id),
      type: "spirit",
      name: str(r.dest_nome),
      manufacturer: str(r.dest_produtor),
      country: paisNome(r),
      rating: num(r.dest_nota),
      date: str(r.dest_data_degustacao),
      category: str(r.dest_tipo),
    }),
  },
  drink: {
    table: "drink",
    idCol: "drink_id",
    select: "drink_id,drink_nome,drink_produtor,drink_nota,drink_data_degustacao,list_pais(pais_nome)",
    dateCol: "drink_data_degustacao",
    map: (r) => ({
      id: num(r.drink_id),
      type: "drink",
      name: str(r.drink_nome),
      manufacturer: str(r.drink_produtor),
      country: paisNome(r),
      rating: num(r.drink_nota),
      date: str(r.drink_data_degustacao),
      category: "",
    }),
  },
};

/** Load one category's items for a given owner. RLS allows own items or, when
 *  viewing a followed profile, that profile's items (read-only). */
export async function fetchItems(type: ItemType, ownerId: string): Promise<Item[]> {
  const cfg = CONFIG[type];
  const { data, error } = await getSupabaseClient()
    .from(cfg.table)
    .select(cfg.select)
    .eq("user_id", ownerId)
    .order(cfg.dateCol, { ascending: false, nullsFirst: false });
  if (error) {
    console.error(`fetch ${type} error:`, error.message);
    return [];
  }
  return (data ?? []).map((r) => cfg.map(r as unknown as Record<string, unknown>));
}

/** Delete one item. RLS enforces ownership server-side (belt-and-suspenders). */
export async function deleteItem(type: ItemType, id: number): Promise<boolean> {
  const cfg = CONFIG[type];
  const { error } = await getSupabaseClient().from(cfg.table).delete().eq(cfg.idCol, id);
  if (error) {
    console.error(`delete ${type} error:`, error.message);
    return false;
  }
  return true;
}

/** Duplicate an item: copy every column except the PK and created_at, re-insert.
 *  Keeps user_id (your own), so you can only ever duplicate into your collection. */
export async function duplicateItem(type: ItemType, id: number): Promise<boolean> {
  const cfg = CONFIG[type];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(cfg.table).select("*").eq(cfg.idCol, id).single();
  if (error || !data) {
    console.error(`duplicate (read) ${type} error:`, error?.message);
    return false;
  }
  const copy = { ...(data as Record<string, unknown>) };
  delete copy[cfg.idCol];
  delete copy.created_at;
  const { error: insErr } = await supabase.from(cfg.table).insert(copy);
  if (insErr) {
    console.error(`duplicate (insert) ${type} error:`, insErr.message);
    return false;
  }
  return true;
}

async function fetchType(type: ItemType, ownerId: string): Promise<Item[]> {
  return fetchItems(type, ownerId);
}

/** Load all four catalog tables for a given owner (own items only). */
export async function fetchCatalog(ownerId: string): Promise<Catalog> {
  const [beer, wine, drink, spirit] = await Promise.all([
    fetchType("beer", ownerId),
    fetchType("wine", ownerId),
    fetchType("drink", ownerId),
    fetchType("spirit", ownerId),
  ]);
  return { beer, wine, drink, spirit };
}
