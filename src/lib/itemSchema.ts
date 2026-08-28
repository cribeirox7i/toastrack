import { TYPE_TAB, type ItemType } from "@/lib/catalog";

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
      { col: "beer_cervejaria", label: "Cervejaria", role: "producer", kind: "text" },
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
  const res = await fetch("/api/lookups", { cache: "no-store" });
  if (!res.ok) return { pais: [], bjcp: [] };
  const data = (await res.json()) as {
    paises: { pais_id: string; pais_nome: string }[];
    bjcp: { bjcp21_id: string; bjcp21_cod: string }[];
  };
  return {
    pais: data.paises.map((p) => ({ pais_id: Number(p.pais_id), pais_nome: p.pais_nome })),
    bjcp: data.bjcp.map((b) => ({ bjcp21_id: Number(b.bjcp21_id), bjcp21_cod: b.bjcp21_cod })),
  };
}

/** Linha crua de um item (todas as colunas), incluindo user_owner/user_access/user_edit — usado
 *  pra checagem de permissão de edição na tela. `id` é string (UUID pros itens novos; itens
 *  antigos mantêm o número original como string). */
export async function fetchFullItem(
  type: ItemType,
  id: string,
): Promise<Record<string, string> | null> {
  const res = await fetch(`/api/items/${TYPE_TAB[type]}/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, string>;
}

/** Convert a raw DB value to a form string. */
export function toFormString(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Coerce a form string pro formato de texto que a planilha espera (tudo vira string ali —
 *  campo vazio vira "" mesmo, não null: o Apps Script não tem um "sem valor" separado de "vazio"). */
function coerce(field: Field, raw: string): string {
  return (raw ?? "").trim();
}

/**
 * Cria (id null) ou atualiza um item a partir dos valores do formulário. O dono nunca é mandado
 * pelo cliente — a rota de criação sempre grava a sessão como user_owner, ignorando qualquer
 * coisa no corpo (ver src/lib/sheets/items.ts). Retorna o id (string) ou null em falha.
 */
export async function saveItem(
  type: ItemType,
  id: string | null,
  values: Record<string, string>,
): Promise<string | null> {
  const payload: Record<string, string> = {};
  for (const f of SCHEMA[type].fields) payload[f.col] = coerce(f, values[f.col] ?? "");

  if (id == null) {
    const res = await fetch(`/api/items/${TYPE_TAB[type]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const row = (await res.json()) as { id: string };
    return row.id;
  }
  const res = await fetch(`/api/items/${TYPE_TAB[type]}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok ? id : null;
}
