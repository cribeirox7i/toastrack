#!/usr/bin/env node
import "./_loadEnv.mjs";
import { fetchUserById } from "../src/lib/sheets/users.ts";

async function main() {
  const [userId] = process.argv.slice(2);
  const user = await fetchUserById(userId ?? "1");
  if (!user) {
    console.log("não encontrado");
    return;
  }
  console.log(JSON.stringify({ ...user, senha_hash: user.senha_hash ? user.senha_hash.slice(0, 12) + "..." : user.senha_hash }, null, 2));
  console.log("hash tem ':' (formato salt:hash)?", user.senha_hash?.includes(":"));
  console.log("tamanho do hash:", user.senha_hash?.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
