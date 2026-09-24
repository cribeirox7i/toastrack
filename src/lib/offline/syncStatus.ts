import { useEffect, useState } from "react";
import { listOutbox, listPhotoOutbox, type ItemTab, type OutboxEntry } from "./db";
import { getCachedItem, syncEvents } from "./sync";
import { photoUploadEvents } from "@/lib/photoUpload";

/**
 * Ids de itens (da aba `tab`) que ainda têm alguma escrita pendente - texto no outbox (criação ou
 * edição) ou foto no photoOutbox. Cobre o item recém-criado (id temporário, ver `sync.ts`) e também
 * uma edição/foto de um item já sincronizado feita offline - em ambos os casos o outbox ainda
 * segura a entrada até o envio confirmar, então já é o sinal certo sem precisar de um campo próprio.
 */
async function computeSyncingIds(tab: ItemTab): Promise<Set<string>> {
  const [outbox, photos] = await Promise.all([listOutbox(), listPhotoOutbox()]);
  const ids = new Set<string>();
  for (const e of outbox) {
    if (e.tab !== tab) continue;
    if (e.kind === "createItem" && e.payload.id) ids.add(e.payload.id);
    else if (e.itemId) ids.add(e.itemId);
  }
  for (const p of photos) {
    if (p.tab === tab) ids.add(p.itemId);
  }
  return ids;
}

/** Recalcula em toda mudança de sync (outbox mandou/falhou, remap) ou de foto (upload terminou) -
 *  é o que faz a bolinha da lista sumir sozinha assim que o envio confirma. */
export function useSyncingIds(tab: ItemTab): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void computeSyncingIds(tab).then((next) => {
        if (!cancelled) setIds(next);
      });
    };
    refresh();
    syncEvents.addEventListener("change", refresh);
    syncEvents.addEventListener("remap", refresh);
    photoUploadEvents.addEventListener("done", refresh);
    return () => {
      cancelled = true;
      syncEvents.removeEventListener("change", refresh);
      syncEvents.removeEventListener("remap", refresh);
      photoUploadEvents.removeEventListener("done", refresh);
    };
  }, [tab]);

  return ids;
}

// ---------- Fila de sincronização (card "Fila de sincronização" do Perfil) ----------

const NAME_COL: Record<ItemTab, string> = {
  beer: "beer_nome",
  wine: "wine_nome",
  dest: "dest_nome",
  drink: "drink_nome",
};

export interface OutboxQueueRow {
  localId: string;
  tab: ItemTab;
  kind: OutboxEntry["kind"] | "photo";
  label: string;
  attempts: number;
  lastError?: string;
  createdAt: number;
}

/** Junta outbox de texto + fila de fotos numa lista só, já com o nome do item resolvido (do
 *  próprio payload pra `createItem`, senão do cache local) pra mostrar algo legível em vez de só
 *  o id — é o que deixa achar "aquele item que ficou preso" sem ter que abrir o console. */
async function computeQueue(): Promise<OutboxQueueRow[]> {
  const [outbox, photos] = await Promise.all([listOutbox(), listPhotoOutbox()]);
  const rows: OutboxQueueRow[] = [];

  for (const e of outbox) {
    const id = e.kind === "createItem" ? e.payload.id : e.itemId;
    let label = e.payload[NAME_COL[e.tab]] ?? "";
    if (!label && id) label = (await getCachedItem(e.tab, id))?.[NAME_COL[e.tab]] ?? "";
    rows.push({
      localId: e.localId,
      tab: e.tab,
      kind: e.kind,
      label: label || `#${id ?? "?"}`,
      attempts: e.attempts,
      lastError: e.lastError,
      createdAt: e.createdAt,
    });
  }

  for (const p of photos) {
    const label = (await getCachedItem(p.tab, p.itemId))?.[NAME_COL[p.tab]] ?? `#${p.itemId}`;
    rows.push({
      localId: p.localId,
      tab: p.tab,
      kind: "photo",
      label,
      attempts: p.attempts,
      lastError: p.lastError,
      createdAt: p.createdAt,
    });
  }

  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** Recalcula nos mesmos eventos que `useSyncingIds` - toda mudança de outbox/foto. */
export function useOutboxQueue(): OutboxQueueRow[] {
  const [rows, setRows] = useState<OutboxQueueRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void computeQueue().then((next) => {
        if (!cancelled) setRows(next);
      });
    };
    refresh();
    syncEvents.addEventListener("change", refresh);
    syncEvents.addEventListener("remap", refresh);
    photoUploadEvents.addEventListener("done", refresh);
    return () => {
      cancelled = true;
      syncEvents.removeEventListener("change", refresh);
      syncEvents.removeEventListener("remap", refresh);
      photoUploadEvents.removeEventListener("done", refresh);
    };
  }, []);

  return rows;
}
