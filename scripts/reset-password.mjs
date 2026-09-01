#!/usr/bin/env node
import "./_loadEnv.mjs";
/**
 * Reseta a senha de um usuário existente pelo user_id, gerando senha provisória nova (padrão do
 * WebCRM — nunca reaproveita senha antiga). Script descartável, mesmo formato do promote-admin.
 *
 * Uso: node --experimental-strip-types scripts/reset-password.mjs <user_id>
 */
import { fetchUserById, adminResetPassword } from "../src/lib/sheets/users.ts";

async function main() {
  const [userId] = process.argv.slice(2);
  if (!userId) {
    console.error("Uso: scripts/reset-password.mjs <user_id>");
    process.exit(1);
  }

  const user = await fetchUserById(userId);
  if (!user) {
    console.error(`Nenhum usuário encontrado com id "${userId}".`);
    process.exit(1);
  }

  const { provisionalPassword } = await adminResetPassword(user.user_id);

  console.log(`"${user.user_nome}" (${user.user_mail}, id ${user.user_id}) teve a senha resetada.`);
  console.log(`Senha provisória (mostrada só agora, não fica salva em lugar nenhum): ${provisionalPassword}`);
  console.log("A pessoa será obrigada a trocar a senha no primeiro login.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
