import { DBSchema, IDBPDatabase, openDB } from "idb";

/** Nome real da aba na planilha — beer/wine/dest/drink (ver src/lib/sheets/types.ts ITEM_TAB). */
export type ItemTab = "beer" | "wine" | "dest" | "drink";

export const ITEM_TABS: ItemTab[] = ["beer", "wine", "dest", "drink"];

/** Linha crua de um item (todas as colunas, tudo string) — mesma forma que a API devolve. */
export interface RawItemRow {
  id: string;
  [campo: string]: string | undefined;
}

export interface OutboxEntry {
  localId: string;
  kind: "createItem" | "updateItem" | "deleteItem";
  tab: ItemTab;
  /** Para updateItem/deleteItem — createItem já traz o id dentro de `payload.id`. */
  itemId?: string;
  payload: Record<string, string>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

interface ToastrackDB extends DBSchema {
  beer: { key: string; value: RawItemRow };
  wine: { key: string; value: RawItemRow };
  dest: { key: string; value: RawItemRow };
  drink: { key: string; value: RawItemRow };
  meta: { key: string; value: { key: string; value: unknown } };
  outbox: { key: string; value: OutboxEntry };
}

const DB_NAME = "toastrack-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ToastrackDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ToastrackDB>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB não disponível (chamado fora do navegador)");
  }
  if (!dbPromise) {
    dbPromise = openDB<ToastrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const tab of ITEM_TABS) {
          if (!db.objectStoreNames.contains(tab)) {
            db.createObjectStore(tab, { keyPath: "id" });
          }
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "localId" });
        }
      },
    });
  }
  return dbPromise;
}

/** Uma transação só com as ~3600 linhas do `beer` é grande demais pra alguns navegadores mobile
 *  (a transação pode ser abortada no meio, e aí NENHUMA linha entra). Gravar em lotes mantém cada
 *  transação curta; se uma falhar, as anteriores já estão salvas. */
const PUT_CHUNK = 400;

export async function putAll(tab: ItemTab, rows: RawItemRow[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDB();
  for (let i = 0; i < rows.length; i += PUT_CHUNK) {
    const lote = rows.slice(i, i + PUT_CHUNK);
    const tx = db.transaction(tab, "readwrite");
    await Promise.all(lote.map((r) => tx.store.put(r)));
    await tx.done;
  }
}

export async function putOne(tab: ItemTab, row: RawItemRow): Promise<void> {
  const db = await getDB();
  await db.put(tab, row);
}

export async function getOne(tab: ItemTab, id: string): Promise<RawItemRow | undefined> {
  const db = await getDB();
  return db.get(tab, id);
}

export async function listAll(tab: ItemTab): Promise<RawItemRow[]> {
  const db = await getDB();
  return db.getAll(tab);
}

export async function deleteOne(tab: ItemTab, id: string): Promise<void> {
  const db = await getDB();
  await db.delete(tab, id);
}

export async function getMeta(key: string): Promise<unknown> {
  const db = await getDB();
  const row = await db.get("meta", key);
  return row?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function enqueueOutbox(entry: Omit<OutboxEntry, "createdAt" | "attempts">) {
  const db = await getDB();
  await db.put("outbox", { ...entry, createdAt: Date.now(), attempts: 0 });
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await getDB();
  const all = await db.getAll("outbox");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOutboxEntry(localId: string) {
  const db = await getDB();
  await db.delete("outbox", localId);
}

export async function updateOutboxEntry(entry: OutboxEntry) {
  const db = await getDB();
  await db.put("outbox", entry);
}

/** Apaga tudo (dados de item, lookups, fila) — chamado no logout, senão os dados de quem saiu
 *  continuam legíveis no IndexedDB pro próximo login no mesmo aparelho. */
export async function wipeLocalData(): Promise<void> {
  const db = await getDB();
  const stores = Array.from(db.objectStoreNames);
  const tx = db.transaction(stores, "readwrite");
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}
