import "server-only";
import { randomUUID } from "node:crypto";
import { callAppsScript } from "./client";
import { canRead, canWrite, ensureInEditList } from "./permissions";
import { ITEM_TAB, type ItemRowBase, type ItemType } from "./types";

/**
 * Repositório genérico das 4 abas de item (beer/wine/dest/drink) — mesma forma pras 4, já que o
 * schema é simétrico (id/user_owner/user_access/user_edit/updated_at + campos prefixados por
 * tipo). Toda função aqui já aplica a permissão da seção 4 do plano: nada disto deve ser chamado
 * a partir de uma rota que não tenha primeiro resolvido `sessionUserId` da sessão autenticada —
 * nunca de um valor vindo do corpo da requisição.
 */

const nowIso = () => new Date().toISOString();

/** Lista os itens de um tipo visíveis pro usuário da sessão (dono, ou em user_access/user_edit). */
export async function listVisibleItems(
  tipo: ItemType,
  sessionUserId: string
): Promise<ItemRowBase[]> {
  const linhas = await callAppsScript<ItemRowBase[]>("read", { tab: ITEM_TAB[tipo] });
  return linhas.filter((row) => canRead(row, sessionUserId));
}

/** Busca um item por id, devolvendo null se não existir OU se a sessão não tiver permissão de
 *  leitura — de propósito não distingue os dois casos (não vazar que o item existe). */
export async function getItemIfVisible(
  tipo: ItemType,
  id: string,
  sessionUserId: string
): Promise<ItemRowBase | null> {
  const linhas = await callAppsScript<ItemRowBase[]>("read", { tab: ITEM_TAB[tipo] });
  const row = linhas.find((r) => r.id === id);
  if (!row || !canRead(row, sessionUserId)) return null;
  return row;
}

/**
 * Cria um item. `payload` são só os campos de conteúdo (ex.: beer_nome, beer_abv) — `id`,
 * `user_owner`, `user_edit` e `updated_at` são sempre calculados aqui, nunca aceitos do chamador,
 * pra fechar a brecha de alguém criar um item em nome de outro usuário.
 */
export async function createItem(
  tipo: ItemType,
  payload: Record<string, string>,
  sessionUserId: string
): Promise<ItemRowBase> {
  const row: ItemRowBase = {
    ...payload,
    id: randomUUID(),
    user_owner: sessionUserId,
    user_access: payload.user_access ?? "",
    // O criador sempre entra em user_edit (mesmo já sendo o dono, ensureInEditList não duplica) -
    // garante que trocar o dono depois não deixe quem criou sem conseguir editar.
    user_edit: ensureInEditList({ user_owner: sessionUserId, user_edit: payload.user_edit }, sessionUserId),
    updated_at: nowIso(),
  };
  await callAppsScript("append", { tab: ITEM_TAB[tipo], rows: [row] });
  return row;
}

export type UpdateResult = "ok" | "not_found" | "forbidden";

/**
 * Atualiza um item já existente. `patch` pode incluir user_access/user_edit (compartilhar/revogar
 * acesso) mas NUNCA user_owner — trocar o dono não é suportado por esta função de propósito
 * (evita um vetor de "roubar" um item mudando o dono pra si).
 */
export async function updateItem(
  tipo: ItemType,
  id: string,
  patch: Record<string, string>,
  sessionUserId: string
): Promise<UpdateResult> {
  const linhas = await callAppsScript<ItemRowBase[]>("read", { tab: ITEM_TAB[tipo] });
  const row = linhas.find((r) => r.id === id);
  if (!row) return "not_found";
  if (!canWrite(row, sessionUserId)) return "forbidden";

  const { user_owner: _ignoreOwner, ...patchSemDono } = patch;
  void _ignoreOwner;
  await callAppsScript("updateById", {
    tab: ITEM_TAB[tipo],
    id,
    patch: { ...patchSemDono, updated_at: nowIso() },
  });
  return "ok";
}

export async function deleteItem(
  tipo: ItemType,
  id: string,
  sessionUserId: string
): Promise<UpdateResult> {
  const linhas = await callAppsScript<ItemRowBase[]>("read", { tab: ITEM_TAB[tipo] });
  const row = linhas.find((r) => r.id === id);
  if (!row) return "not_found";
  if (!canWrite(row, sessionUserId)) return "forbidden";

  await callAppsScript("deleteById", { tab: ITEM_TAB[tipo], id });
  return "ok";
}
