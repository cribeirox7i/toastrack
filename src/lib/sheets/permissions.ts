import type { ItemRowBase } from "./types";

/**
 * Regras de permissão por item (MIGRACAO_SHEETS.md seção 4) — o que era RLS no Postgres vira
 * checagem explícita aqui. Puro (sem I/O), pra poder testar sem precisar do Apps Script de verdade
 * (ver scripts/test-permissions.mjs).
 */

/** Quebra "12;7; 33" em ["12","7","33"] — tolera espaço em volta do ";" e célula vazia/ausente. */
export function parseIdList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Serializa de volta pro formato de célula, sem duplicar id e sem entrada vazia. */
export function buildIdList(ids: string[]): string {
  return Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean))).join(";");
}

/** Dono do item, ou presente em user_access/user_edit → pode ver o item. */
export function canRead(row: ItemRowBase, userId: string): boolean {
  if (row.user_owner === userId) return true;
  if (parseIdList(row.user_access).includes(userId)) return true;
  if (parseIdList(row.user_edit).includes(userId)) return true;
  return false;
}

/** Dono do item, ou presente em user_edit → pode editar/excluir. user_access NUNCA dá escrita. */
export function canWrite(row: ItemRowBase, userId: string): boolean {
  if (row.user_owner === userId) return true;
  if (parseIdList(row.user_edit).includes(userId)) return true;
  return false;
}

/**
 * Adiciona `userId` a user_edit se ainda não estiver lá (nem já for o dono) — usado ao criar um
 * item, garantindo que quem cria sempre consiga editar mesmo que user_owner mude depois. Também
 * útil pra "compartilhar comigo mesmo" não virar entrada duplicada.
 */
export function ensureInEditList(row: Pick<ItemRowBase, "user_owner" | "user_edit">, userId: string): string {
  const atual = parseIdList(row.user_edit);
  if (row.user_owner === userId || atual.includes(userId)) return buildIdList(atual);
  return buildIdList([...atual, userId]);
}
