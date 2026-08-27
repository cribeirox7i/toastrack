import "server-only";
import { callAppsScript } from "./client";
import type { BjcpRow, PaisRow } from "./types";

/** `list_pais` e `list_bjcp_21` — tabelas de referência, leitura pura, sem checagem de permissão
 *  (visíveis a qualquer usuário logado, igual eram no Supabase). */

export async function fetchPaises(): Promise<PaisRow[]> {
  return callAppsScript<PaisRow[]>("read", { tab: "list_pais" });
}

export async function fetchBjcp(): Promise<BjcpRow[]> {
  return callAppsScript<BjcpRow[]>("read", { tab: "list_bjcp_21" });
}
