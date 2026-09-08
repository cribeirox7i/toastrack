/**
 * numberBR.ts - conversão de número decimal entre a planilha (vírgula, pt-BR) e o código (ponto).
 *   node scripts/test-number-br.mjs
 */
import assert from "node:assert/strict";
import { parseNumBR, toStoredBR, toFormBR, toDisplayBR, fmtDecimalBR } from "../src/lib/numberBR.ts";

let passed = 0;
function check(nome, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${nome}`);
}

check("parseNumBR aceita vírgula E ponto (dados existentes são mistos)", () => {
  assert.equal(parseNumBR("3,5"), 3.5);
  assert.equal(parseNumBR("3.5"), 3.5);
  assert.equal(parseNumBR("7"), 7);
  assert.equal(parseNumBR(""), NaN);
  assert.equal(parseNumBR(null), NaN);
  assert.equal(parseNumBR(undefined), NaN);
  assert.equal(parseNumBR("  4,2  "), 4.2);
});

check("toStoredBR: ponto -> vírgula, inteiro e vazio intactos", () => {
  assert.equal(toStoredBR("5.2"), "5,2");
  assert.equal(toStoredBR("40"), "40");
  assert.equal(toStoredBR(""), "");
  assert.equal(toStoredBR("  6.0 "), "6,0");
});

check("toFormBR: vírgula -> ponto (pro <input type=number>)", () => {
  assert.equal(toFormBR("5,2"), "5.2");
  assert.equal(toFormBR("5.2"), "5.2");
  assert.equal(toFormBR("40"), "40");
  assert.equal(toFormBR(""), "");
});

check("toDisplayBR: ponto -> vírgula pra exibição", () => {
  assert.equal(toDisplayBR("5.2"), "5,2");
  assert.equal(toDisplayBR("7"), "7");
});

check("fmtDecimalBR: number -> pt-BR com 1 casa fixa", () => {
  assert.equal(fmtDecimalBR(4.5), "4,5");
  assert.equal(fmtDecimalBR(4), "4,0");
  assert.equal(fmtDecimalBR(3.25), "3,3"); // arredonda
});

check("ida e volta: formulário -> planilha -> formulário não perde nada", () => {
  for (const original of ["5.2", "4", "0.5", ""]) {
    assert.equal(toFormBR(toStoredBR(original)), original === "" ? "" : original);
  }
});

console.log(`\n${passed} testes de numberBR passaram.`);
