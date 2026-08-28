#!/usr/bin/env node
import "./_loadEnv.mjs";
/**
 * Cria o primeiro usuário (normalmente admin) direto na planilha — o app não tem outra forma de
 * criar o primeiro usuário sem já estar logado, e não há cadastro público (ver MIGRACAO_SHEETS.md
 * seção 8). Reaproveita createUser de src/lib/sheets/users.ts (senha provisória, scrypt, mesmo
 * caminho que a rota de admin vai usar pros usuários seguintes) em vez de reimplementar aqui.
 *
 * Uso: npm run create-admin -- "Nome" "email@exemplo.com" [admin|user]
 * (role default é "admin", já que a razão de existir deste script é o primeiro admin)
 */
import { ensureStructureOnce } from "../src/lib/sheets/setup.ts";
import { createUser } from "../src/lib/sheets/users.ts";

async function main() {
  const [nome, email, role = "admin"] = process.argv.slice(2);

  if (!nome || !email) {
    console.error('Uso: npm run create-admin -- "Nome" "email@exemplo.com" [admin|user]');
    process.exit(1);
  }
  if (role !== "admin" && role !== "user") {
    console.error(`role inválida: "${role}" (use admin ou user)`);
    process.exit(1);
  }

  await ensureStructureOnce();
  const { user, provisionalPassword } = await createUser({ nome, email, role });

  console.log(`Usuário "${user.user_nome}" (${user.user_mail}) criado como "${user.user_role}".`);
  console.log(`Senha provisória (mostrada só agora, não fica salva em lugar nenhum): ${provisionalPassword}`);
  console.log("A pessoa será obrigada a trocar a senha no primeiro login.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
