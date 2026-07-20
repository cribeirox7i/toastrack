import { getSupabaseClient } from "@/lib/supabase/client";
import { TYPE_TABLE, type ItemType } from "@/lib/catalog";

/** A field in the per-type detail/edit form. `role` drives special layout;
 *  `kind` drives the input/rendering. `col` is the real DB column. */
export type FieldRole = "name" | "producer" | "rating" | "field";
export type FieldKind = "text" | "number" | "date" | "select" | "country" | "bjcp";

export type Field = {
  col: string;
  label: string;
  role: FieldRole;
  kind?: FieldKind;
  options?: readonly string[];
  suffix?: string;
};

export const WINE_COR = ["Tinto", "Branco", "Rosé", "Verde", "Laranja"] as const;
export const WINE_TIPO = ["Seco", "Semi-Seco", "Suave", "Brut"] as const;
export const DEST_TIPO = [
  "Cachaça", "Vodka", "Gin", "Whisky", "Rum", "Tequila",
  "Brandy", "Pisco", "Shochu", "Saque", "Vermute", "Bitter",
] as const;

type TypeSchema = { imgNomeCol: string; fields: Field[] };

export const SCHEMA: Record<ItemType, TypeSchema> = {
  beer: {
    imgNomeCol: "beer_img_nome",
    fields: [
      { col: "beer_nome", label: "Nome", role: "name" },
      { col: "beer_produtor", label: "Cervejaria", role: "producer", kind: "text" },
      { col: "beer_nota", label: "Avaliação", role: "rating" },
      { col: "pais_id", label: "País", role: "field", kind: "country" },
      { col: "beer_data", label: "Data de degustação", role: "field", kind: "date" },
      { col: "beer_ibu", label: "IBU", role: "field", kind: "number" },
      { col: "beer_abv", label: "ABV", role: "field", kind: "number", suffix: "%" },
      { col: "beer_estilo_livre", label: "Estilo (livre)", role: "field", kind: "text" },
      { col: "bjcp21_id", label: "Estilo BJCP", role: "field", kind: "bjcp" },
    ],
  },
  wine: {
    imgNomeCol: "wine_img_nome",
    fields: [
      { col: "wine_nome", label: "Nome", role: "name" },
      { col: "wine_produtor", label: "Produtor", role: "producer", kind: "text" },
      { col: "wine_nota", label: "Avaliação", role: "rating" },
      { col: "pais_id", label: "País", role: "field", kind: "country" },
      { col: "wine_data_degustacao", label: "Data de degustação", role: "field", kind: "date" },
      { col: "wine_safra", label: "Safra", role: "field", kind: "number" },
      { col: "wine_cor", label: "Cor", role: "field", kind: "select", options: WINE_COR },
      { col: "wine_tipo", label: "Tipo", role: "field", kind: "select", options: WINE_TIPO },
      { col: "wine_regiao", label: "Região", role: "field", kind: "text" },
      { col: "wine_uva", label: "Uva", role: "field", kind: "text" },
      { col: "wine_abv", label: "ABV", role: "field", kind: "number", suffix: "%" },
    ],
  },
  spirit: {
    imgNomeCol: "dest_img_nome",
    fields: [
      { col: "dest_nome", label: "Nome", role: "name" },
      { col: "dest_produtor", label: "Produtor", role: "producer", kind: "text" },
      { col: "dest_nota", label: "Avaliação", role: "rating" },
      { col: "pais_id", label: "País", role: "field", kind: "country" },
      { col: "dest_data_degustacao", label: "Data de degustação", role: "field", kind: "date" },
      { col: "dest_tipo", label: "Tipo", role: "field", kind: "select", options: DEST_TIPO },
      { col: "dest_safra", label: "Safra / envelhecimento (anos)", role: "field", kind: "number" },
      { col: "dest_regiao", label: "Região", role: "field", kind: "text" },
      { col: "dest_abv", label: "ABV", role: "field", kind: "number", suffix: "%" },
    ],
  },
  drink: {
    imgNomeCol: "drink_img_nome",
    fields: [
      { col: "drink_nome", label: "Nome", role: "name" },
      { col: "drink_produtor", label: "Fabricante", role: "producer", kind: "text" },
      { col: "drink_nota", label: "Avaliação", role: "rating" },
      { col: "pais_id", label: "País", role: "field", kind: "country" },
      { col: "drink_data_degustacao", label: "Data de degustação", role: "field", kind: "date" },
      { col: "drink_regiao", label: "Região", role: "field", kind: "text" },
      { col: "drink_abv", label: "ABV", role: "field", kind: "number", suffix: "%" },
    ],
  },
};

export function fieldByRole(type: ItemType, role: FieldRole): Field | undefined {
  return SCHEMA[type].fields.find((f) => f.role === role);
}

export type Lookup = { pais: { pais_id: number; pais_nome: string }[]; bjcp: { bjcp21_id: number; bjcp21_cod: string }[] };

export async function fetchLookups(): Promise<Lookup> {
  const supabase = getSupabaseClient();
  const [pais, bjcp] = await Promise.all([
    supabase.from("list_pais").select("pais_id,pais_nome").order("pais_nome"),
    supabase.from("list_bjcp_21").select("bjcp21_id,bjcp21_cod").order("bjcp21_id"),
  ]);
  return {
    pais: (pais.data ?? []) as Lookup["pais"],
    bjcp: (bjcp.data ?? []) as Lookup["bjcp"],
  };
}

/** Raw DB row for one item (all columns), including user_id for ownership checks. */
export async function fetchFullItem(
  type: ItemType,
  id: number,
): Promise<Record<string, unknown> | null> {
  const { table, idCol } = TYPE_TABLE[type];
  const { data, error } = await getSupabaseClient()
    .from(table)
    .select("*")
    .eq(idCol, id)
    .single();
  if (error) {
    console.error("fetchFullItem error:", error.message);
    return null;
  }
  return data as Record<string, unknown>;
}

/** Convert a raw DB value to a form string. */
export function toFormString(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Coerce a form string back to the DB value for its field kind. */
function coerce(field: Field, raw: string): unknown {
  const v = (raw ?? "").trim();
  if (field.role === "rating") return v === "" ? null : Number(v);
  switch (field.kind) {
    case "number":
    case "country":
    case "bjcp":
      return v === "" ? null : Number(v);
    case "date":
      return v === "" ? null : v;
    default:
      return v === "" ? null : v;
  }
}

/**
 * Insert (id null) or update an item from form values. Always stamps
 * user_id = ownUserId on insert, so you can only ever create under your own id
 * (RLS enforces the same server-side). Returns the row id, or null on failure.
 */
export async function saveItem(
  type: ItemType,
  id: number | null,
  values: Record<string, string>,
  ownUserId: string,
): Promise<number | null> {
  const { table, idCol } = TYPE_TABLE[type];
  const supabase = getSupabaseClient();
  const payload: Record<string, unknown> = {};
  for (const f of SCHEMA[type].fields) payload[f.col] = coerce(f, values[f.col] ?? "");

  if (id == null) {
    const { data, error } = await supabase
      .from(table)
      .insert({ ...payload, user_id: ownUserId })
      .select(idCol)
      .single();
    if (error) {
      console.error("saveItem insert error:", error.message);
      return null;
    }
    return Number((data as unknown as Record<string, unknown>)[idCol]);
  }
  const { error } = await supabase.from(table).update(payload).eq(idCol, id);
  if (error) {
    console.error("saveItem update error:", error.message);
    return null;
  }
  return id;
}
