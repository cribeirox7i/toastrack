/**
 * Espelho client-side de src/lib/sheets/permissions.ts (que é server-only) — só pra decidir o que
 * MOSTRAR na tela (botões de editar/excluir). A garantia de verdade é sempre a rota de API, que
 * roda a mesma regra no servidor; isto aqui nunca é a única barreira.
 */
function parseIdList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canEditRow(row: { user_owner?: string; user_edit?: string }, userId: string): boolean {
  if (!userId) return false;
  if (row.user_owner === userId) return true;
  return parseIdList(row.user_edit).includes(userId);
}
