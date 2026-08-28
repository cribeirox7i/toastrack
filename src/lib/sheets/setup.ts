import "server-only";
import { callAppsScript } from "./client";

/**
 * Chama a ação `ensureStructure` do Apps Script — confere que todas as abas/colunas esperadas
 * existem (não apaga nada, só cria o que falta). Usado pelo script `create-admin` (garante que a
 * planilha está pronta antes do primeiro usuário) e pode ser exposto depois numa tela de admin,
 * mesmo padrão do TravelTrack ("Admin → Parâmetros → Verificar/criar abas na planilha").
 */
export async function ensureStructureOnce(): Promise<{
  abasCriadas: string[];
  colunasAdicionadas: Record<string, string[]>;
}> {
  return callAppsScript("ensureStructure", {});
}
