/** Password policy (mín. 8, maiúscula, minúscula, número, símbolo) — checagem client-side pra UX
 *  imediata; o servidor valida de novo com a mesma regra em src/lib/senhaSchema.ts (nunca confiar
 *  só no cliente). Fetch de perfil e log de acesso migraram pras rotas de API — ver
 *  src/components/AuthProvider.tsx e src/lib/sheets/*. */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function validatePassword(pw: string): boolean {
  return PASSWORD_REGEX.test(pw || "");
}
