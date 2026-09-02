import "server-only";
import { randomUUID } from "node:crypto";
import { callAppsScript } from "./client";
import { canRead, canWrite, ensureInEditList } from "./permissions";
import {
  ITEM_DRIVE_CATEGORY,
  ITEM_IMG_NOME_COL,
  ITEM_IMG_URL_COL,
  ITEM_TAB,
  type ItemRowBase,
  type ItemType,
} from "./types";

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

/**
 * Como listVisibleItems, mas só as linhas mudadas depois de `since` (etapa 6 — cache local). O
 * Apps Script (`readSince`) ainda lê a aba inteira pra filtrar (mesmo custo de `read` quando algo
 * de fato mudou) — o ganho real é poder pular essa chamada de vez quando nada mudou, comparando
 * primeiro com `getItemsStamp` (barato, só a aba SyncMeta). `since` vazio devolve tudo, igual
 * `listVisibleItems`.
 */
export async function listVisibleItemsSince(
  tipo: ItemType,
  sessionUserId: string,
  since: string
): Promise<ItemRowBase[]> {
  const linhas = await callAppsScript<ItemRowBase[]>("readSince", {
    tab: ITEM_TAB[tipo],
    desde: since,
  });
  return linhas.filter((row) => canRead(row, sessionUserId));
}

/** Carimbo (ISO) da última escrita na aba deste tipo, segundo a aba SyncMeta — não lê a aba de
 *  item, só uma célula de SyncMeta. '' se a aba nunca foi escrita (ou ensureStructure é recente
 *  o bastante pra SyncMeta ainda não ter entrada). Usado pelo cliente pra saber, antes de puxar
 *  qualquer coisa, se o cache local já está em dia. */
export async function getItemsStamp(tipo: ItemType): Promise<string> {
  return callAppsScript<string>("metaGet", { chave: ITEM_TAB[tipo] });
}

/** Busca um item por id, devolvendo null se não existir OU se a sessão não tiver permissão de
 *  leitura — de propósito não distingue os dois casos (não vazar que o item existe). */
export async function getItemIfVisible(
  tipo: ItemType,
  id: string,
  sessionUserId: string
): Promise<ItemRowBase | null> {
  // readById lê só a linha pedida (localizando pela coluna id, não a aba inteira) — contra o
  // beer real (3591 linhas) é isso que tira o ~9-10s de abrir 1 item pra bem menos que 1s.
  const row = await callAppsScript<ItemRowBase | null>("readById", { tab: ITEM_TAB[tipo], id });
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
  const { id: idDoCliente, ...conteudo } = payload;
  const row: ItemRowBase = {
    ...conteudo,
    // Reaproveita o id do cliente quando informado (etapa 6 — item criado offline já nasce com
    // um uuid local; se o servidor gerasse outro, o item apareceria "duplicado" na UI até a
    // próxima sincronização trocar a referência). Mesmo padrão do createTrip do TravelTrack.
    id: idDoCliente || randomUUID(),
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
  const row = await callAppsScript<ItemRowBase | null>("readById", { tab: ITEM_TAB[tipo], id });
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
  const row = await callAppsScript<ItemRowBase | null>("readById", { tab: ITEM_TAB[tipo], id });
  if (!row) return "not_found";
  if (!canWrite(row, sessionUserId)) return "forbidden";

  await callAppsScript("deleteById", { tab: ITEM_TAB[tipo], id });
  return "ok";
}

interface DriveUploadResult {
  fileId: string;
  name: string;
  url: string;
}

export type UploadPhotoResult =
  | { ok: true; url: string; imgNome: string }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Sobe uma foto pro Drive (pasta {categoria}/{sessionUserId}/, ver Codigo.gs `driveUploadFile`)
 * e grava o link + nome do arquivo nas colunas de imagem do item — mesmas colunas já usadas
 * pelos ~3600 itens reais (ver ITEM_IMG_URL_COL/ITEM_IMG_NOME_COL). Igual a updateItem: exige
 * permissão de escrita (dono ou user_edit), nunca aceita categoria/pasta vinda do corpo da
 * requisição. Não apaga a foto anterior do Drive (fica órfã lá) — fora de escopo desta rodada.
 */
export async function uploadItemPhoto(
  tipo: ItemType,
  id: string,
  sessionUserId: string,
  foto: { base64Data: string; mimeType: string; filename: string }
): Promise<UploadPhotoResult> {
  const row = await callAppsScript<ItemRowBase | null>("readById", { tab: ITEM_TAB[tipo], id });
  if (!row) return { ok: false, reason: "not_found" };
  if (!canWrite(row, sessionUserId)) return { ok: false, reason: "forbidden" };

  const uploaded = await callAppsScript<DriveUploadResult>("driveUploadFile", {
    categoria: ITEM_DRIVE_CATEGORY[tipo],
    userId: sessionUserId,
    base64Data: foto.base64Data,
    mimeType: foto.mimeType,
    filename: foto.filename,
  });

  await callAppsScript("updateById", {
    tab: ITEM_TAB[tipo],
    id,
    patch: {
      [ITEM_IMG_URL_COL[tipo]]: uploaded.url,
      [ITEM_IMG_NOME_COL[tipo]]: uploaded.name,
      updated_at: nowIso(),
    },
  });

  return { ok: true, url: uploaded.url, imgNome: uploaded.name };
}
