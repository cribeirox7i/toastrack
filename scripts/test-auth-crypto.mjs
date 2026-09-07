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

check("generateProvisionalPassword: tamanho, sem ambíguo, e política mínima em toda geração", () => {
  const senha = generateProvisionalPassword(12);
  assert.equal(senha.length, 12);
  assert.doesNotMatch(senha, /[0O1lI]/);
  // Nunca menos que 8, mesmo pedindo menos.
  assert.equal(generateProvisionalPassword(4).length, 8);
  // As 4 classes, checadas em muitas amostras (a garantia é por construção, não por sorte).
  for (let i = 0; i < 500; i += 1) {
    const s = generateProvisionalPassword(8);
    assert.match(s, /[A-Z]/, `sem maiúscula: ${s}`);
    assert.match(s, /[a-z]/, `sem minúscula: ${s}`);
    assert.match(s, /[0-9]/, `sem número: ${s}`);
    assert.match(s, /[^A-Za-z0-9]/, `sem símbolo: ${s}`);
    assert.doesNotMatch(s, /[0O1lI]/, `caractere ambíguo: ${s}`);
  }
});

check("generateToken devolve hex de 64 caracteres (32 bytes)", () => {
  const t = generateToken();
  assert.match(t, /^[0-9a-f]{64}$/);
});

console.log(`\n${passed} testes passaram.`);
