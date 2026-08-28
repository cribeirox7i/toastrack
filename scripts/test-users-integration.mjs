import "./_loadEnv.mjs";
/**
 * Teste de integração de src/lib/sheets/users.ts contra o Apps Script REAL. Cria UM usuário de
 * teste na aba `user` de verdade, exercita login/troca de senha/reset por admin, e apaga no final
 * (try/finally) — mesma disciplina do test-sheets-integration.mjs, pra nunca deixar lixo na
 * aba real de usuários (que hoje tem só 3 contas).
 *
 *   npx tsx --conditions=react-server scripts/test-users-integration.mjs
 */
import assert from "node:assert/strict";
import {
  createUser,
  fetchUserByEmail,
  verifyCredentials,
  changeOwnPassword,
  adminResetPassword,
} from "../src/lib/sheets/users.ts";
import { callAppsScript } from "../src/lib/sheets/client.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const EMAIL_TESTE = `teste-integracao-${Date.now()}@exemplo.invalido`;
let userId = null;

try {
  let senhaAtual;

  await check("createUser grava usuário ativo com senha provisória hasheada", async () => {
    const { user, provisionalPassword } = await createUser({
      nome: "Teste Integração APAGAR",
      email: EMAIL_TESTE,
      role: "user",
    });
    userId = user.user_id;
    senhaAtual = provisionalPassword;
    assert.equal(user.user_status, "S");
    assert.equal(user.deve_trocar_senha, "true");
    assert.match(user.senha_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    assert.ok(provisionalPassword.length >= 10);
  });

  await check("createUser recusa e-mail duplicado", async () => {
    await assert.rejects(() => createUser({ nome: "Outro", email: EMAIL_TESTE }));
  });

  await check("verifyCredentials aceita a senha provisória e recusa senha errada", async () => {
    const ok = await verifyCredentials(EMAIL_TESTE, senhaAtual);
    assert.ok(ok, "senha provisória deveria autenticar");
    const falha = await verifyCredentials(EMAIL_TESTE, "senha-errada-qualquer");
    assert.equal(falha, null);
  });

  await check("changeOwnPassword troca a senha e limpa deve_trocar_senha", async () => {
    const novaSenha = "NovaSenha#Teste123";
    const r = await changeOwnPassword(userId, senhaAtual, novaSenha);
    assert.deepEqual(r, { ok: true });
    senhaAtual = novaSenha;

    const logouComNova = await verifyCredentials(EMAIL_TESTE, novaSenha);
    assert.ok(logouComNova);
    const user = await fetchUserByEmail(EMAIL_TESTE);
    assert.equal(user.deve_trocar_senha, "false");
  });

  await check("changeOwnPassword recusa se a senha atual estiver errada", async () => {
    const r = await changeOwnPassword(userId, "senha-atual-errada", "QualquerCoisa#1");
    assert.equal(r.ok, false);
  });

  await check("adminResetPassword gera nova provisória e força troca de novo", async () => {
    const { provisionalPassword } = await adminResetPassword(userId);
    senhaAtual = provisionalPassword;
    const ok = await verifyCredentials(EMAIL_TESTE, provisionalPassword);
    assert.ok(ok);
    const user = await fetchUserByEmail(EMAIL_TESTE);
    assert.equal(user.deve_trocar_senha, "true");
  });

  console.log(`\n${passed} testes passaram.`);
} finally {
  if (userId) {
    console.log(`\nLimpando usuário de teste ${userId}...`);
    await callAppsScript("deleteByField", { tab: "user", campo: "user_id", valor: userId }).catch((e) => {
      console.error("FALHA AO LIMPAR — apague manualmente na planilha:", userId, e);
    });
  }
}
