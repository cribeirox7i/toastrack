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
 * Loads the logged-in user's own items (all 4 catalog tables) and exposes them
 * to the app. Reloads when the user changes. `reload()` lets screens refresh
 * after a create/edit/delete. Pagination is a later concern — for now it loads
 * the full set (fine for personal collections at this stage).
 */
export default function CatalogProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
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
