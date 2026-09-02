/**
 * Tipos das linhas retornadas pelo Apps Script (ver apps-script/Codigo.gs ESTRUTURA). Todo valor
 * de célula vem como string (é assim que `lerTabela` do script sanitiza) — a coerção pra
 * número/data acontece do lado do Next.js, nunca confiando no tipo que o Sheets "acha" que uma
 * célula é.
 */

export type ItemType = "beer" | "wine" | "dest" | "drink";

/** Nome real da aba na planilha para cada tipo — ver MIGRACAO_SHEETS.md seção 3. */
export const ITEM_TAB: Record<ItemType, string> = {
  beer: "beer",
  wine: "wine",
  dest: "dest",
  drink: "drink",
};

/** Categoria usada nos verbos de Drive do Apps Script (payload.categoria) — maiúsculo, ver
 *  Codigo.gs e DRIVE_ROOT_FOLDERS em Config.gs. */
export const ITEM_DRIVE_CATEGORY: Record<ItemType, string> = {
  beer: "BEER",
  wine: "WINE",
  dest: "DEST",
  drink: "DRINK",
};

/** Colunas de foto por tipo — mesmas usadas pelos ~3600 itens reais (nome do arquivo + link do
 *  Drive). Upload de foto (seção 6 do plano) escreve nelas depois de subir pro Drive. */
export const ITEM_IMG_URL_COL: Record<ItemType, string> = {
  beer: "beer_img_url",
  wine: "wine_img_url",
  dest: "dest_img_url",
  drink: "drink_img_url",
};

export const ITEM_IMG_NOME_COL: Record<ItemType, string> = {
  beer: "beer_img_nome",
  wine: "wine_img_nome",
  dest: "dest_img_nome",
  drink: "drink_img_nome",
};

/** Campos comuns a toda aba de item — permissão (seção 4 do plano) + sync (seção 5). O resto dos
 *  campos é específico de cada tipo (beer_nome, wine_cor, ...), por isso ficam soltos como string. */
export interface ItemRowBase {
  id: string;
  user_owner: string;
  /** Lista de ids separados por ";" — leitura, além do dono. Pode vir vazia ("" ou ausente). */
  user_access?: string;
  /** Lista de ids separados por ";" — leitura + edição/exclusão, além do dono. */
  user_edit?: string;
  updated_at?: string;
  [campo: string]: string | undefined;
}

export interface UserRow {
  user_id: string;
  user_nome: string;
  user_mail: string;
  user_status: "S" | "N" | string;
  user_role: "admin" | "user" | "" | string;
  user_idioma?: string;
  user_paleta?: string;
  user_modo?: string;
  user_url_img?: string;
  senha_hash?: string;
  deve_trocar_senha?: string; // "true"/"false" em texto — Sheets não tem boolean nativo
  convite_token?: string;
  convite_expira_em?: string;
  [campo: string]: string | undefined;
}

export interface PaisRow {
  pais_id: string;
  pais_nome: string;
  pais_img: string;
}

export interface BjcpRow {
  bjcp21_id: string;
  bjcp21_cod: string;
  [campo: string]: string | undefined;
}

export interface LogRow {
  log_id: string;
  log_data: string;
  user_id: string;
  user_mail: string;
  acao: string;
  tabela?: string;
  registro_id?: string;
  detalhe?: string;
}
