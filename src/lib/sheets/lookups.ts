import "server-only";
import { callAppsScript } from "./client";
import type { BjcpRow, LibRow, PaisRow } from "./types";

/** `list_pais` e `list_bjcp_21` — tabelas de referência, leitura pura, sem checagem de permissão
 *  (visíveis a qualquer usuário logado, igual eram no Supabase). */

export async function fetchPaises(): Promise<PaisRow[]> {
  return callAppsScript<PaisRow[]>("read", { tab: "list_pais" });
}

export async function fetchBjcp(): Promise<BjcpRow[]> {
  return callAppsScript<BjcpRow[]>("read", { tab: "list_bjcp_21" });
}

/** Conteúdo da Biblioteca — mesma regra de acesso (leitura pura, qualquer usuário logado). */
export async function fetchLib(): Promise<LibRow[]> {
  return callAppsScript<LibRow[]>("read", { tab: "lib" });
}

/** Nome + mimeType de um arquivo da Biblioteca, sem bytes — usado pra decidir se abre (PDF/PNG/
 *  JPG/BMP/DOCX/XLSX) antes de baixar o conteúdo inteiro. */
export async function fetchLibFileInfo(fileId: string): Promise<{ name: string; mimeType: string }> {
  return callAppsScript("libFileInfo", { fileId });
}

/** Bytes (base64) de um arquivo da Biblioteca já aprovado por `fetchLibFileInfo`. */
export async function downloadLibFile(
  fileId: string,
): Promise<{ name: string; mimeType: string; base64Data: string }> {
  return callAppsScript("libDownloadFile", { fileId });
}
