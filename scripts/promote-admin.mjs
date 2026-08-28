#!/usr/bin/env node
/**
 * Promove um usuário já existente na aba `user` a admin, com senha provisória nova (padrão do
 * WebCRM — nunca reaproveita a senha antiga, que pode nem ter um hash compatível com o scrypt
 * usado aqui). Útil pro primeiro admin real quando a conta já existe (ex.: linha importada do
 * Supabase, sem senha utilizável no novo sistema) em vez de criar uma linha duplicada.
 *
 * Uso: npm run promote-admin -- "email@exemplo.com"
 */
import { fetchUserByEmail, adminResetPassword, setUserPrivileges } from "../src/lib/sheets/users.ts";

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error('Uso: npm run promote-admin -- "email@exemplo.com"');
    process.exit(1);
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    console.error(`Nenhum usuário encontrado com o e-mail "${email}".`);
    process.exit(1);
  }

  await setUserPrivileges(user.user_id, { user_role: "admin", user_status: "S" });
  const { provisionalPassword } = await adminResetPassword(user.user_id);

  console.log(`"${user.user_nome}" (${user.user_mail}, id ${user.user_id}) agora é admin.`);
  console.log(`Senha provisória (mostrada só agora, não fica salva em lugar nenhum): ${provisionalPassword}`);
  console.log("A pessoa será obrigada a trocar a senha no primeiro login.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
