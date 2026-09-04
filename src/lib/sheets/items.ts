import "server-only";
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

/**
 * Próximo id sequencial de uma aba. Caminho normal: ação `proximoIdSequencial` do Apps Script
 * (contador em SyncMeta, sob lock). Se essa ação ainda não estiver publicada no Web App (deploy
 * do Codigo.gs atrasado), cai pra um fallback que lê a aba e usa maior id numérico + 1 - mais
 * caro e sem proteção contra duas criações simultâneas, mas impede que criar item quebre de vez
 * enquanto o script não é atualizado.
 */
async function proximoId(tipo: ItemType): Promise<string> {
  const tab = ITEM_TAB[tipo];
  try {
    return await callAppsScript<string>("proximoIdSequencial", { tab });
  } catch {
    const linhas = await callAppsScript<Record<string, string>[]>("read", { tab });
    let maior = 0;
    for (const l of linhas) {
      const n = Number(l.id);
      if (Number.isFinite(n) && n > maior) maior = n;
    }
    return String(maior + 1);
  }
}

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

/** Uma entrada do índice de sincronização: id + hash do conteúdo da linha. */
export interface ItemIndexEntry {
  id: string;
  h: string;
}

/**
 * Índice das linhas visíveis pro usuário: id + hash do conteúdo, sem os campos de dado. As mesmas
 * 3593 linhas do `beer` que dão 1,84 MB em `listVisibleItems` cabem em ~55 KB aqui — e o `read`
 * completo dessa aba chegou a levar 2min38 e a falhar 1 em 5 vezes (medido 2026-09-03), o que
 * fazia o app pular a aba em silêncio. Com o índice o cliente descobre barato o que mudou e pede
 * só isso em `listVisibleItemsByIds`.
 *
 * O hash cobre o conteúdo inteiro da linha, não o `updated_at` — por isso enxerga edição feita à
 * mão na planilha, que é justamente o que o carimbo de SyncMeta e o `readSince` nunca viram.
 */
export async function listVisibleIndex(
  tipo: ItemType,
  sessionUserId: string
): Promise<ItemIndexEntry[]> {
  let linhas: (ItemIndexEntry & ItemRowBase)[];
  try {
    linhas = await callAppsScript<(ItemIndexEntry & ItemRowBase)[]>("readIndex", {
      tab: ITEM_TAB[tipo],
    });
  } catch {
    // Enquanto o Codigo.gs com `readIndex` não estiver publicado, cai pra ler a aba e calcular o
    // hash aqui. Não traz o ganho nenhum (a resposta grande do Apps Script é justamente o
    // problema), mas mantém o app funcionando entre o deploy do código e o do script — foi
    // exatamente essa lacuna que quebrou a criação de item no 7d220f4.
    const todas = await callAppsScript<ItemRowBase[]>("read", { tab: ITEM_TAB[tipo] });
    linhas = todas.map((row) => ({ ...row, h: hashRow(row) }) as ItemIndexEntry & ItemRowBase);
  }
  return linhas.filter((row) => canRead(row, sessionUserId)).map(({ id, h }) => ({ id, h }));
}

/** As linhas pedidas por id, já filtradas por permissão — par de `listVisibleIndex`. O cliente
 *  chama em lotes; um id que ele não pode ver simplesmente não volta. */
export async function listVisibleItemsByIds(
  tipo: ItemType,
  ids: string[],
  sessionUserId: string
): Promise<ItemRowBase[]> {
  if (!ids.length) return [];
  const pedidos = new Set(ids.map(String));
  let linhas: ItemRowBase[];
  try {
    linhas = await callAppsScript<ItemRowBase[]>("readByIds", { tab: ITEM_TAB[tipo], ids });
  } catch {
    // Mesmo motivo do fallback de listVisibleIndex.
    const todas = await callAppsScript<ItemRowBase[]>("read", { tab: ITEM_TAB[tipo] });
    linhas = todas.filter((row) => pedidos.has(String(row.id)));
  }
  return linhas.filter((row) => canRead(row, sessionUserId));
}

/**
 * Mesma FNV-1a de 32 bits do `hashLinha` do Codigo.gs, pro fallback acima produzir hashes
 * comparáveis. Não precisa bater byte a byte com o do Apps Script: se divergirem, o cliente só
 * rebaixa as linhas uma vez e volta a convergir — nunca mostra dado errado.
 */
function hashRow(row: Record<string, unknown>): string {
  let h = 0x811c9dc5;
  const mistura = (c: number) => {
    h ^= c;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  };
  for (const chave of Object.keys(row)) {
    const s = String(row[chave] ?? "");
    for (let j = 0; j < s.length; j++) mistura(s.charCodeAt(j));
    mistura(1);
  }
  return h.toString(36);
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
  // O id é SEMPRE sequencial, atribuído aqui - nunca aceito do cliente (decisão do Carlos
  // 2026-09-02: "a chave das tabelas precisa ser sequencial, sempre acréscimo do maior número").
  // Isso é diferente do id que o cliente eventualmente manda (`payload.id`, um uuid temporário
  // gerado pelo `createItemOffline` pra criação otimista offline) - o id do cliente é só um
  // placeholder local; o real (devolvido aqui) pode ser outro, e quem chamou isto do lado do
  // cliente (src/lib/offline/sync.ts, `remapItemId`) troca a referência local pelo id de verdade.
  const { id: _idDoCliente, ...conteudo } = payload;
  void _idDoCliente;
  const novoId = await proximoId(tipo);
  const row: ItemRowBase = {
    ...conteudo,
    id: novoId,
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
 * Sobe uma foto pro Drive (pasta {categoria}/{sessionUserId}/, ver Codigo.gs `itemFotoUpload`)
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

  // Uma chamada só: `itemFotoUpload` sobe pro Drive E grava as colunas de imagem na mesma
  // execução do Apps Script (ver Codigo.gs). Eram duas chamadas separadas; como cada ida ao Apps
  // Script leva de 3s a 60s conforme o humor do Google (medido em 2026-09-03), juntar as duas é
  // o que tira essa rota da faixa em que ela estourava o tempo da função.
  //
  // `tentativas: 1` de propósito: repetir um upload que talvez já tenha funcionado cria uma
  // cópia da foto no Drive (ver comentário de idempotência em client.ts). Timeout mais folgado
  // que o padrão porque aqui trafega o arquivo inteiro.
  const uploaded = await callAppsScript<DriveUploadResult>(
    "itemFotoUpload",
    {
      categoria: ITEM_DRIVE_CATEGORY[tipo],
      userId: sessionUserId,
      base64Data: foto.base64Data,
      mimeType: foto.mimeType,
      filename: foto.filename,
      tab: ITEM_TAB[tipo],
      id,
      colUrl: ITEM_IMG_URL_COL[tipo],
      colNome: ITEM_IMG_NOME_COL[tipo],
      updatedAt: nowIso(),
    },
    { tentativas: 1, timeoutMs: 120_000 },
  );

  return { ok: true, url: uploaded.url, imgNome: uploaded.name };
}
