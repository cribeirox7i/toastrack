"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { EMPTY_CATALOG, mapRows, type Catalog } from "@/lib/catalog";
import { useOfflineItems, useOfflineLookups } from "@/lib/offline/useOfflineData";
import { initSync, pullItemsIfStale } from "@/lib/offline/sync";

type CatalogContextValue = {
  catalog: Catalog;
  loading: boolean;
  reload: () => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

/**
 * Expõe os itens visíveis ao usuário logado (todas as 4 categorias), servidos do cache local
 * (IndexedDB, etapa 6 — MIGRACAO_SHEETS.md seção 5) com sincronização em segundo plano. A
 * primeira renderização já vem do que estiver salvo no aparelho (instantâneo); a checagem contra
 * o servidor (carimbo em SyncMeta, barato) acontece à parte e só baixa algo se de fato mudou.
 * `reload()` dispara essa checagem de novo — chamado pelas telas depois de criar/editar/excluir,
 * embora a escrita otimista (ver src/lib/offline/sync.ts) já atualize o cache local na hora,
 * então na prática isto só cobre o caso de outro dispositivo ter mudado algo nesse meio-tempo.
 */
export default function CatalogProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();

  useEffect(() => {
    initSync();
  }, []);

  const beer = useOfflineItems("beer");
  const wine = useOfflineItems("wine");
  const dest = useOfflineItems("dest");
  const drink = useOfflineItems("drink");
  const { paises } = useOfflineLookups();

  const paisNome = useMemo(() => {
    const map = new Map(paises.map((p) => [String(p.pais_id), p.pais_nome]));
    return (id: string) => map.get(id) ?? "";
  }, [paises]);

  const catalog = useMemo<Catalog>(() => {
    if (!userId) return EMPTY_CATALOG;
    return {
      beer: mapRows("beer", beer.items, paisNome, userId),
      wine: mapRows("wine", wine.items, paisNome, userId),
      spirit: mapRows("spirit", dest.items, paisNome, userId),
      drink: mapRows("drink", drink.items, paisNome, userId),
    };
  }, [userId, beer.items, wine.items, dest.items, drink.items, paisNome]);

  const loading = beer.loading || wine.loading || dest.loading || drink.loading;

  async function reload() {
    await Promise.all([
      pullItemsIfStale("beer"),
      pullItemsIfStale("wine"),
      pullItemsIfStale("dest"),
      pullItemsIfStale("drink"),
    ]);
  }

  return (
    <CatalogContext.Provider value={{ catalog, loading, reload }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within <CatalogProvider>");
  return ctx;
}
