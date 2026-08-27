import "server-only";
import { randomUUID } from "node:crypto";
import { callAppsScript } from "./client";
import type { LogRow } from "./types";

/**
 * Aba real `log` (reaproveitada como está, ver MIGRACAO_SHEETS.md seção 3.1) — só append+read,
 * nunca update/delete, por isso não precisa de coluna "id" renomeada. `log_id` aqui só documenta
 * a ordem de inserção, nunca é usado pra localizar uma linha específica.
 */

export async function logAccess(input: {
  userId: string;
  userMail: string;
  acao: string;
  tabela?: string;
  registroId?: string;
  detalhe?: string;
}): Promise<void> {
  const row: LogRow = {
    log_id: randomUUID(),
    log_data: new Date().toISOString(),
    user_id: input.userId,
    user_mail: input.userMail,
    acao: input.acao,
    tabela: input.tabela ?? "",
    registro_id: input.registroId ?? "",
    detalhe: input.detalhe ?? "",
  };
  await callAppsScript("append", { tab: "log", rows: [row] });
}

/** Só a rota de admin deve chamar isto — a checagem de "quem pede é admin" fica na rota. */
export async function fetchLog(): Promise<LogRow[]> {
  return callAppsScript<LogRow[]>("read", { tab: "log" });
}
