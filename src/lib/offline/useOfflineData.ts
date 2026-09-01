"use client";

import { useCallback, useEffect, useState } from "react";
import { listAll, type RawItemRow, type ItemTab } from "./db";
import { getCachedLookups, pullItemsIfStale, pullLookups, syncEvents, type LookupsResponse } from "./sync";

function useSyncChangeListener(callback: () => void) {
  useEffect(() => {
    syncEvents.addEventListener("change", callback);
    return () => syncEvents.removeEventListener("change", callback);
  }, [callback]);
}

/** Itens de uma aba: lê do IndexedDB na hora (local, rápido) e atualiza em segundo plano quando
 *  online — mesmo padrão do `useOfflineCollection` do TravelTrack, sem escopo por viagem. */
export function useOfflineItems(tab: ItemTab) {
  const [items, setItems] = useState<RawItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const local = await listAll(tab);
    setItems(local);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    void refresh();
    void pullItemsIfStale(tab);
  }, [refresh, tab]);

  useSyncChangeListener(refresh);

  return { items, loading };
}

/** Países/BJCP: mesma lógica, sem escopo nenhum — são globais. */
export function useOfflineLookups() {
  const [lookups, setLookups] = useState<LookupsResponse>({ paises: [], bjcp: [] });

  const refresh = useCallback(async () => {
    const local = await getCachedLookups();
    if (local) setLookups(local);
  }, []);

  useEffect(() => {
    void refresh();
    void pullLookups();
  }, [refresh]);

  useSyncChangeListener(refresh);

  return lookups;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
