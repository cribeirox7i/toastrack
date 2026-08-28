"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import { fetchCatalog, EMPTY_CATALOG, type Catalog } from "@/lib/catalog";

type CatalogContextValue = {
  catalog: Catalog;
  loading: boolean;
  reload: () => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

/**
 * Carrega os itens visíveis ao usuário logado (todas as 4 categorias) e expõe pro app. Recarrega
 * quando o usuário muda. `reload()` deixa as telas atualizarem depois de criar/editar/excluir.
 */
export default function CatalogProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setCatalog(EMPTY_CATALOG);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchCatalog(userId);
    setCatalog(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <CatalogContext.Provider value={{ catalog, loading, reload: load }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within <CatalogProvider>");
  return ctx;
}
