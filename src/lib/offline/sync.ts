import {
  ITEM_TABS,
  OutboxEntry,
  RawItemRow,
  deleteOne,
  enqueueOutbox,
  getMeta,
  getOne,
  listAll,
  listOutbox,
  putAll,
  putOne,
  removeOutboxEntry,
  setMeta,
  updateOutboxEntry,
  type ItemTab,
} from "./db";
import { noCacheUrl } from "@/lib/utils";

/**
 * Motor de sincronização dos 4 tipos de item (etapa 6 do plano — MIGRACAO_SHEETS.md seção 5).
 * Contra o `beer` real (3591 linhas) ler a aba inteira toda vez que uma tela abre levava ~18s —
 * o carimbo em SyncMeta (`/api/items/[tab]/meta`, barato, não lê a aba de item) deixa o cliente
 * saber que nada mudou sem pagar esse custo; quando algo mudou, `readSince` traz só o delta.
 * Escritas são otimistas (grava local + enfileira + tenta mandar), mesmo padrão do TravelTrack
 * (`C:\Claude\TravelTrack\src\lib\offline\sync.ts`) — mas sem outbox de arquivo: o Toastrack
 * ainda não tem upload de imagem implementado, só campos de texto.
 */

export const syncEvents = new EventTarget();

function notifyChange() {
  syncEvents.dispatchEvent(new Event("change"));
}

/** Detalhe de um evento "remap" - ver remapItemId. Quem estiver com uma tela aberta olhando pro
 *  id antigo (ex.: DetailScreen num rascunho criado offline) escuta isto pra trocar de referência
 *  sem precisar sair da tela. */
export interface RemapDetail {
  tab: ItemTab;
  oldId: string;
  newId: string;
}

function notifyRemap(detail: RemapDetail) {
  syncEvents.dispatchEvent(new CustomEvent<RemapDetail>("remap", { detail }));
}

/** Ids reais (atribuídos pelo servidor, ver `proximoIdSequencial` em Codigo.gs) são sempre
 *  numéricos. Um id local temporário (`createItemOffline`) é um uuid, com hífen. */
function isTempId(id: string): boolean {
  return !/^\d+$/.test(id);
}

/**
 * Resolve pro id REAL de um item, esperando o remap se ainda não sincronizou.
 *
 * Existe pro upload de foto: como `saveItem` agora é sempre local-primeiro (2026-09-04), um item
 * recém-criado nasce com um id temporário, e a rota de foto (`/api/items/[tipo]/[id]/foto`)
 * precisa do id real - ela escreve direto na linha da planilha via Apps Script, que não sabe nada
 * sobre uuids locais. Isto não bloqueia a tela: quem chama isto já fechou o Salvar e está rodando
 * em segundo plano (ver `queuePhotoUpload`); esperar aqui é justamente o ponto.
 *
 * Corrida aceitável: se o remap já tiver acontecido ANTES desta chamada começar a escutar, a
 * promise nunca resolve. Na prática isso exigiria a sincronização completar entre o
 * `createItemOffline` retornar e este código rodar - os dois no mesmo tick de `save()`, e a
 * sincronização depende de pelo menos uma ida à rede - então não é um risco real.
 */
export function waitForRealId(tab: ItemTab, id: string): Promise<string> {
  if (!isTempId(id)) return Promise.resolve(id);
  return new Promise((resolve) => {
    function onRemap(e: Event) {
      const d = (e as CustomEvent<RemapDetail>).detail;
      if (d.tab === tab && d.oldId === id) {
        syncEvents.removeEventListener("remap", onRemap);
        resolve(d.newId);
      }
    }
    syncEvents.addEventListener("remap", onRemap);
  });
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(noCacheUrl(url), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const syncedAtKey = (tab: ItemTab) => `syncedAt:${tab}`;

/**
 * Atualiza o cache local de uma aba de item se (e só se) o servidor tiver algo mais novo.
 * 1. Sem carimbo local → busca tudo (`GET /api/items/[tab]`), grava, carimba com o valor de
 *    `/api/items/[tab]/meta` (nunca calculado a partir das linhas — o servidor é quem sabe).
 * 2. Com carimbo local → primeiro `/api/items/[tab]/meta` (barato); igual ao que já tem, não faz
 *    mais nada; diferente, busca só o delta (`?since=`) e funde por cima do que já está salvo.
 */
export async function pullItemsIfStale(tab: ItemTab): Promise<void> {
  if (!isOnline()) return;
  const local = (await getMeta(syncedAtKey(tab))) as string | undefined;

  if (!local) {
    // Primeira carga neste aparelho: vai pelo índice + lotes, nunca por um `read` da aba inteira
    // (o `beer` real são 1,84 MB numa resposta só, que chegou a levar 2min38 e a falhar 1 em 5
    // vezes — ver syncTabByIndex). Em lotes, um lote que falhe não derruba a carga inteira.
    const r = await syncTabByIndex(tab);
    if (r.erro) return;
    const meta = await getJson<{ updatedAt: string }>(`/api/items/${tab}/meta`);
    if (meta) await setMeta(syncedAtKey(tab), meta.updatedAt);
    notifyChange();
    return;
  }

  const meta = await getJson<{ updatedAt: string }>(`/api/items/${tab}/meta`);
  if (!meta || meta.updatedAt === local) return; // já em dia, não gasta a chamada de delta

  const delta = await getJson<RawItemRow[]>(`/api/items/${tab}?since=${encodeURIComponent(local)}`);
  if (delta === null) return;
  await putAll(tab, delta);
  await setMeta(syncedAtKey(tab), meta.updatedAt);
  notifyChange();
}

/** O que aconteceu com uma aba numa reconciliação — o botão de atualizar mostra isso pro usuário
 *  em vez de terminar em silêncio (era impossível saber se "nada mudou" era sucesso ou falha). */
export interface RefreshTabResult {
  tab: ItemTab;
  linhas: number;
  baixadas: number;
  apagadas: number;
  erro?: string;
}

/** Ids por lote ao buscar linhas mudadas. Segura a resposta na casa das centenas de KB — passar
 *  disso é voltar ao problema que motivou tudo isto (ver syncTabByIndex). Bate com o `max(500)`
 *  aceito pela rota `by-ids`. */
const FETCH_CHUNK = 300;

/**
 * Sincroniza uma aba comparando hashes, sem nunca baixar a aba inteira.
 *
 * O `GET /api/items/beer` (aba inteira) é inviável: 3593 linhas = 1,84 MB, de 10s a 2min38, com 1
 * em 5 respondendo HTTP 500 — medido contra produção em 2026-09-03. O cliente pulava a aba em
 * silêncio e o usuário via "atualizei e não mudou nada". Aqui:
 *
 * 1. baixa o índice (`{id, h}` por linha, ~55 KB no `beer`);
 * 2. compara com o hash que guardou junto de cada linha (`_h`);
 * 3. apaga o que sumiu do índice, e busca em lotes só o que mudou.
 *
 * O hash é do conteúdo da linha, não do `updated_at` — é isso que faz uma edição feita à mão na
 * planilha aparecer, que era o problema original. E um id que sumiu do índice é uma exclusão, o
 * que fecha o caso do item "fantasma" que o `readSince` nunca conseguiu enxergar.
 */
async function syncTabByIndex(tab: ItemTab): Promise<RefreshTabResult> {
  const vazio = { tab, linhas: 0, baixadas: 0, apagadas: 0 };

  const index = await getJson<{ id: string; h: string }[]>(`/api/items/${tab}/sync-index`);
  if (index === null) return { ...vazio, erro: "o índice não respondeu" };

  const locais = await listAll(tab);
  const hLocal = new Map(locais.map((r) => [r.id, r._h ?? ""]));
  const hRemoto = new Map(index.map((e) => [e.id, e.h]));

  const paraApagar = locais.filter((r) => !hRemoto.has(r.id)).map((r) => r.id);
  for (const id of paraApagar) await deleteOne(tab, id);

  const paraBuscar = index.filter((e) => hLocal.get(e.id) !== e.h).map((e) => e.id);
  let baixadas = 0;
  for (let i = 0; i < paraBuscar.length; i += FETCH_CHUNK) {
    const ids = paraBuscar.slice(i, i + FETCH_CHUNK);
    const rows = await postJson<RawItemRow[]>(`/api/items/${tab}/by-ids`, { ids });
    if (rows === null) {
      return {
        tab,
        linhas: index.length,
        baixadas,
        apagadas: paraApagar.length,
        erro: `falhou ao baixar ${ids.length} itens`,
      };
    }
    // O hash vai junto da linha: é o que a próxima sincronização compara. Se a linha não fosse
    // gravada com ele, toda sincronização baixaria tudo de novo.
    await putAll(tab, rows.map((r) => ({ ...r, _h: hRemoto.get(r.id) ?? "" })));
    baixadas += rows.length;
  }

  return { tab, linhas: index.length, baixadas, apagadas: paraApagar.length };
}

/**
 * Reconciliação completa, sob pedido explícito do usuário (botão "atualizar" da barra superior).
 * As 4 abas vão em paralelo e cada uma é isolada num try/catch: se uma falhar, as outras ainda
 * entram e o cache local é sempre notificado no fim.
 */
export async function refreshAllNow(): Promise<RefreshTabResult[]> {
  if (!isOnline()) {
    return ITEM_TABS.map((tab) => ({ tab, linhas: 0, baixadas: 0, apagadas: 0, erro: "sem conexão" }));
  }
  await pushOutbox().catch(() => {});

  const results = await Promise.all(
    ITEM_TABS.map(async (tab): Promise<RefreshTabResult> => {
      try {
        const r = await syncTabByIndex(tab);
        if (!r.erro) {
          const meta = await getJson<{ updatedAt: string }>(`/api/items/${tab}/meta`);
          if (meta) await setMeta(syncedAtKey(tab), meta.updatedAt);
        }
        return r;
      } catch (err) {
        return {
          tab,
          linhas: 0,
          baixadas: 0,
          apagadas: 0,
          erro: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  await pullLookups().catch(() => {});
  notifyChange();
  return results;
}

export async function getCachedItem(tab: ItemTab, id: string): Promise<RawItemRow | undefined> {
  return getOne(tab, id);
}

/** Aplica no cache local um patch que já foi confirmado pelo servidor (ex.: upload de foto, ver
 *  src/lib/photoUpload.ts) — ao contrário de `updateItemOffline`, NÃO enfileira no outbox: a
 *  escrita já aconteceu, isto só evita esperar o próximo `pullItemsIfStale` pra a UI mostrar o
 *  resultado. */
export async function applyServerPatch(
  tab: ItemTab,
  id: string,
  patch: Record<string, string>
): Promise<void> {
  const existing = await getOne(tab, id);
  await putOne(tab, { ...(existing ?? { id }), ...patch });
  notifyChange();
}

export async function getCachedItems(tab: ItemTab): Promise<RawItemRow[]> {
  return listAll(tab);
}

// ---------- Lookups (países/BJCP) — pequenos, sem carimbo, só evita refetch a cada tela ----------

export interface LookupsResponse {
  paises: { pais_id: string; pais_nome: string }[];
  // bjcp21_subestilo: descrição do subestilo (pedido do Carlos 2026-09-04, exibição da cerveja
  // mostra código + descrição) - opcional porque a aba pode não ter essa coluna preenchida em
  // toda linha.
  bjcp: { bjcp21_id: string; bjcp21_cod: string; bjcp21_subestilo?: string }[];
}

const LOOKUPS_KEY = "lookups";

export async function pullLookups(): Promise<void> {
  if (!isOnline()) return;
  const data = await getJson<LookupsResponse>("/api/lookups");
  if (data) {
    await setMeta(LOOKUPS_KEY, data);
    notifyChange();
  }
}

export async function getCachedLookups(): Promise<LookupsResponse | null> {
  const cached = (await getMeta(LOOKUPS_KEY)) as LookupsResponse | undefined;
  return cached ?? null;
}

// ---------- Fila de escrita (outbox) ----------

export const MAX_OUTBOX_ATTEMPTS = 5;
let pushing = false;

/** Resultado de tentar mandar uma entrada da fila. `remap` só existe pra "createItem" quando o
 *  servidor devolveu um id diferente do que o cliente mandou - ver ITEM_ID_SEQUENCIAL abaixo. */
type SendResult =
  | { status: "ok"; remap?: { tab: ItemTab; oldId: string; newId: string } }
  | { status: "network-error" }
  | { status: "error"; message: string };

export async function pushOutbox(): Promise<void> {
  if (pushing || !isOnline()) return;
  pushing = true;
  try {
    const entries = await listOutbox();
    for (const entry of entries) {
      if (entry.attempts >= MAX_OUTBOX_ATTEMPTS) continue;
      const result = await sendOutboxEntry(entry);
      if (result.status === "network-error") break; // provavelmente caiu o sinal - tenta depois
      if (result.status === "ok") {
        await removeOutboxEntry(entry.localId);
        if (result.remap) await remapItemId(result.remap.tab, result.remap.oldId, result.remap.newId, entries);
      } else {
        await updateOutboxEntry({ ...entry, attempts: entry.attempts + 1, lastError: result.message });
      }
      notifyChange();
    }
  } finally {
    pushing = false;
  }
}

/**
 * O id de um item novo é sempre sequencial e atribuído pelo SERVIDOR (ITEM_ID_SEQUENCIAL, pedido
 * do Carlos 2026-09-02: "a chave das tabelas precisa ser sequencial") - o servidor ignora
 * completamente o id que o cliente manda em `createItem`. Só que a criação otimista (ver
 * `createItemOffline`) precisa de um id NA HORA, antes de qualquer resposta do servidor, pra
 * gravar local e mostrar o item na tela - por isso ainda gera um id temporário (uuid) no
 * aparelho. Quando o outbox sincroniza esse `createItem` e o servidor devolve o id real (que
 * nunca bate com o temporário), a linha local muda de chave (o id antigo deixa de existir) e
 * qualquer outra escrita já enfileirada pra esse mesmo item (uma edição feita antes de
 * sincronizar, por exemplo) precisa apontar pro id novo - é isso que `remapItemId` faz.
 */
async function remapItemId(tab: ItemTab, oldId: string, newId: string, pendingEntries: OutboxEntry[]): Promise<void> {
  const row = await getOne(tab, oldId);
  if (row) {
    await deleteOne(tab, oldId);
    await putOne(tab, { ...row, id: newId });
  }
  for (const other of pendingEntries) {
    if (other.tab === tab && other.itemId === oldId) {
      other.itemId = newId;
      await updateOutboxEntry(other);
    }
  }
  notifyRemap({ tab, oldId, newId });
}

async function sendOutboxEntry(entry: OutboxEntry): Promise<SendResult> {
  try {
    let res: Response;
    switch (entry.kind) {
      case "createItem":
        res = await fetch(`/api/items/${entry.tab}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        break;
      case "updateItem":
        res = await fetch(`/api/items/${entry.tab}/${entry.itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        break;
      case "deleteItem":
        res = await fetch(`/api/items/${entry.tab}/${entry.itemId}`, { method: "DELETE" });
        break;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { status: "error", message: body.error ?? `Erro ${res.status}` };
    }
    if (entry.kind === "createItem") {
      const row = (await res.json().catch(() => null)) as RawItemRow | null;
      const tempId = entry.payload.id;
      if (row?.id && tempId && row.id !== tempId) {
        return { status: "ok", remap: { tab: entry.tab, oldId: tempId, newId: row.id } };
      }
    }
    return { status: "ok" };
  } catch {
    return { status: "network-error" };
  }
}

/** Descarta uma mutação travada (ver MAX_OUTBOX_ATTEMPTS) — quem chama decide se avisa o
 *  usuário que aquele item precisa ser refeito. */
export async function discardOutboxEntry(localId: string): Promise<void> {
  await removeOutboxEntry(localId);
  notifyChange();
}

// ---------- Ações otimistas (grava local + enfileira + tenta sincronizar) ----------

/** Cria um item otimista — devolve um id temporário na hora (uuid gerado localmente) sem esperar
 *  a rede, só pro item existir/aparecer offline; o servidor NÃO reaproveita esse id (é sempre
 *  sequencial, ver createItem em src/lib/sheets/items.ts) - quando o outbox sincronizar, a linha
 *  local é remapeada pro id de verdade (ver `remapItemId`). `fields` são só os campos de conteúdo
 *  (ex.: beer_nome); dono/edição são calculados aqui pra a UI já mostrar "posso editar" antes de
 *  qualquer sincronização — o servidor recalcula os mesmos valores por conta própria. */
export async function createItemOffline(
  tab: ItemTab,
  fields: Record<string, string>,
  ownerId: string
): Promise<string> {
  const id = crypto.randomUUID();
  const row: RawItemRow = {
    ...fields,
    id,
    user_owner: ownerId,
    user_access: "",
    user_edit: "",
    updated_at: new Date().toISOString(),
  };
  await putOne(tab, row);
  await enqueueOutbox({ localId: crypto.randomUUID(), kind: "createItem", tab, payload: { id, ...fields } });
  notifyChange();
  void pushOutbox();
  return id;
}

export async function updateItemOffline(
  tab: ItemTab,
  id: string,
  patch: Record<string, string>
): Promise<void> {
  const existing = await getOne(tab, id);
  await putOne(tab, { ...(existing ?? { id }), ...patch, updated_at: new Date().toISOString() });
  await enqueueOutbox({
    localId: crypto.randomUUID(),
    kind: "updateItem",
    tab,
    itemId: id,
    payload: patch,
  });
  notifyChange();
  void pushOutbox();
}

export async function deleteItemOffline(tab: ItemTab, id: string): Promise<void> {
  await deleteOne(tab, id);
  await enqueueOutbox({ localId: crypto.randomUUID(), kind: "deleteItem", tab, itemId: id, payload: {} });
  notifyChange();
  void pushOutbox();
}

// ---------- Ciclo de vida ----------

let initialized = false;

/** Chamar uma vez no boot client-side (ver CatalogProvider). Sincroniza ao voltar online, ao
 *  focar a aba, e periodicamente — mesmo padrão do TravelTrack. */
export function initSync(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("online", () => {
    pushOutbox().catch(() => {});
    Promise.all(ITEM_TABS.map((t) => pullItemsIfStale(t))).catch(() => {});
    notifyChange();
  });
  window.addEventListener("offline", notifyChange);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOnline()) {
      pushOutbox().catch(() => {});
    }
  });
  setInterval(() => {
    if (isOnline()) {
      pushOutbox().catch(() => {});
      Promise.all(ITEM_TABS.map((t) => pullItemsIfStale(t))).catch(() => {});
    }
  }, 60_000);
}

export type { ItemTab, RawItemRow } from "./db";
