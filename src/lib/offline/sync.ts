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

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
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
    const rows = await getJson<RawItemRow[]>(`/api/items/${tab}`);
    if (rows === null) return;
    await putAll(tab, rows);
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

/** Reconciliação completa (mesmo custo do full read, ~18s no `beer`) — só quando o usuário pede
 *  explicitamente (ex.: puxar-pra-atualizar). É o que corrige um item apagado fora do app (ver
 *  caveat do plano: `readSince` nunca devolve exclusões). */
export async function refreshAllNow(): Promise<void> {
  if (!isOnline()) return;
  await pushOutbox();
  for (const tab of ITEM_TABS) {
    const rows = await getJson<RawItemRow[]>(`/api/items/${tab}`);
    if (rows === null) continue;
    await putAll(tab, rows);
    const meta = await getJson<{ updatedAt: string }>(`/api/items/${tab}/meta`);
    if (meta) await setMeta(syncedAtKey(tab), meta.updatedAt);
  }
  await pullLookups();
  notifyChange();
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
  bjcp: { bjcp21_id: string; bjcp21_cod: string }[];
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

export async function pushOutbox(): Promise<void> {
  if (pushing || !isOnline()) return;
  pushing = true;
  try {
    const entries = await listOutbox();
    for (const entry of entries) {
      if (entry.attempts >= MAX_OUTBOX_ATTEMPTS) continue;
      const result = await sendOutboxEntry(entry);
      if (result === "network-error") break; // provavelmente caiu o sinal de novo - tenta depois
      if (result === "ok") {
        await removeOutboxEntry(entry.localId);
      } else {
        await updateOutboxEntry({ ...entry, attempts: entry.attempts + 1, lastError: result });
      }
      notifyChange();
    }
  } finally {
    pushing = false;
  }
}

async function sendOutboxEntry(entry: OutboxEntry): Promise<"ok" | "network-error" | string> {
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
    if (res.ok) return "ok";
    const body = await res.json().catch(() => ({}));
    return body.error ?? `Erro ${res.status}`;
  } catch {
    return "network-error";
  }
}

/** Descarta uma mutação travada (ver MAX_OUTBOX_ATTEMPTS) — quem chama decide se avisa o
 *  usuário que aquele item precisa ser refeito. */
export async function discardOutboxEntry(localId: string): Promise<void> {
  await removeOutboxEntry(localId);
  notifyChange();
}

// ---------- Ações otimistas (grava local + enfileira + tenta sincronizar) ----------

/** Cria um item otimista — devolve o id na hora (gerado localmente, reaproveitado pelo servidor,
 *  ver createItem em src/lib/sheets/items.ts) sem esperar a rede. `fields` são só os campos de
 *  conteúdo (ex.: beer_nome); dono/edição são calculados aqui pra a UI já mostrar "posso editar"
 *  antes de qualquer sincronização — o servidor recalcula os mesmos valores por conta própria. */
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
