#!/usr/bin/env node
import "./_loadEnv.mjs";
import { verifyCredentials } from "../src/lib/sheets/users.ts";

async function main() {
  const [email, senha] = process.argv.slice(2);
  const user = await verifyCredentials(email, senha);
  console.log(user ? `OK: ${user.user_nome} (${user.user_id})` : "FALHOU: verifyCredentials devolveu null");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
