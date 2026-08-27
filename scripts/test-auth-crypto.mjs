/**
 * Sanidade do módulo de senha (src/lib/authCrypto.ts) — roda em Node puro.
 *   node scripts/test-auth-crypto.mjs
 */
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, generateProvisionalPassword, generateToken } from "../src/lib/authCrypto.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check("hashPassword produz salt:hash em hex, formatos distintos a cada chamada", () => {
  const h1 = hashPassword("Test123!@#");
  const h2 = hashPassword("Test123!@#");
  assert.match(h1, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.notEqual(h1, h2, "salt aleatório deve mudar o hash mesmo pra mesma senha");
});

check("verifyPassword aceita a senha certa e recusa a errada", () => {
  const h = hashPassword("Toastrack#2026");
  assert.equal(verifyPassword("Toastrack#2026", h), true);
  assert.equal(verifyPassword("errada", h), false);
});

check("verifyPassword recusa hash ausente ou malformado sem lançar exceção", () => {
  assert.equal(verifyPassword("qualquer", null), false);
  assert.equal(verifyPassword("qualquer", undefined), false);
  assert.equal(verifyPassword("qualquer", "sem-dois-pontos"), false);
});

check("generateProvisionalPassword tem o tamanho pedido e nunca usa caractere ambíguo", () => {
  const senha = generateProvisionalPassword(12);
  assert.equal(senha.length, 12);
  assert.doesNotMatch(senha, /[0O1lI]/);
});

check("generateToken devolve hex de 64 caracteres (32 bytes)", () => {
  const t = generateToken();
  assert.match(t, /^[0-9a-f]{64}$/);
});

console.log(`\n${passed} testes passaram.`);
