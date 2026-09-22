import { useEffect, useState } from "react";
import { listOutbox, listPhotoOutbox, type ItemTab } from "./db";
import { syncEvents } from "./sync";
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
