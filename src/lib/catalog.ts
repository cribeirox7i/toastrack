import { canEditRow } from "@/lib/itemPermissions";
import {
  createItemOffline,
  deleteItemOffline,
  getCachedItem,
  type ItemTab,
} from "@/lib/offline/sync";

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
  imgUrl: string; // beer_img_url etc., ou "" quando o item não tem foto
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
  imgUrlCol: string;
};

/** A planilha guarda o link de "visualizar no Drive" (`drive.google.com/file/d/{id}/view...`,
 *  às vezes com lixo colado no fim, ex. aspas) — isso é uma página HTML, não uma imagem, não
 *  funciona direto num `<img src>`. Extrai o fileId e monta o link de imagem direta que o Drive
 *  serve sem exigir login (`lh3.googleusercontent.com/d/{id}`, confirmado com uma foto real). */
export function driveImageUrl(raw: string | undefined): string {
  const m = /\/d\/([\w-]+)/.exec(raw ?? "");
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : "";
}

/** Nome da coluna de foto por tipo — usado em DetailScreen pra ler `values[...]` (linha crua,
 *  fora do Item normalizado) sem repetir os 4 nomes de coluna espalhados pela UI. */
export const IMG_URL_COL: Record<ItemType, string> = {
  beer: "beer_img_url",
  wine: "wine_img_url",
  spirit: "dest_img_url",
  drink: "drink_img_url",
};

const CONFIG: Record<ItemType, TypeCfg> = {
  beer: { nameCol: "beer_nome", manufacturerCol: "beer_cervejaria", ratingCol: "beer_nota", dateCol: "beer_data", categoryCol: "beer_estilo_livre", imgUrlCol: IMG_URL_COL.beer },
  wine: { nameCol: "wine_nome", manufacturerCol: "wine_produtor", ratingCol: "wine_nota", dateCol: "wine_data_degustacao", categoryCol: "wine_cor", imgUrlCol: IMG_URL_COL.wine },
  spirit: { nameCol: "dest_nome", manufacturerCol: "dest_produtor", ratingCol: "dest_nota", dateCol: "dest_data_degustacao", categoryCol: "dest_tipo", imgUrlCol: IMG_URL_COL.spirit },
  drink: { nameCol: "drink_nome", manufacturerCol: "drink_produtor", ratingCol: "drink_nota", dateCol: "drink_data_degustacao", imgUrlCol: IMG_URL_COL.drink },
};

// país vem só como pais_id na linha crua; o nome é resolvido à parte via /api/lookups, porque a
// rota de itens não faz join (o Apps Script não sabe fazer join entre abas).
export function mapRow(type: ItemType, row: RawItemRow, paisNome: (id: string) => string, userId: string): Item {
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
    imgUrl: driveImageUrl(row[cfg.imgUrlCol]),
    canEdit: canEditRow(row, userId),
  };
}

/** Mapeia + ordena um lote de linhas cruas (do cache local, ver CatalogProvider) numa categoria. */
export function mapRows(type: ItemType, rows: RawItemRow[], paisNome: (id: string) => string, userId: string): Item[] {
  const items = rows.map((r) => mapRow(type, r, paisNome, userId));
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items;
}

/** Exclui um item — otimista (ver src/lib/offline/sync.ts): grava local na hora, sincroniza em
 *  segundo plano. Sempre "true" porque o precondition real (canEdit) já foi checado por quem
 *  chama antes de invocar isto. */
export async function deleteItem(type: ItemType, id: string): Promise<boolean> {
  await deleteItemOffline(TYPE_TAB[type] as ItemTab, id);
  return true;
}

/** Duplica um item: lê a linha inteira (cache local primeiro), tira id/dono/user_access/
 *  user_edit/updated_at (createItemOffline recalcula) e recria — sai sempre como item seu, mesmo
 *  duplicando um item compartilhado com você. */
export async function duplicateItem(type: ItemType, id: string, ownerId: string): Promise<boolean> {
  const tab = TYPE_TAB[type] as ItemTab;
  const row = await getCachedItem(tab, id);
  if (!row) return false;
  const { id: _id, user_owner: _owner, user_access: _access, user_edit: _edit, updated_at: _ts, ...payload } = row;
  void _id; void _owner; void _access; void _edit; void _ts;
  await createItemOffline(tab, payload as Record<string, string>, ownerId);
  return true;
}
