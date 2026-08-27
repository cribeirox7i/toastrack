/**
 * Unit tests for the import's pure parsing helpers.
 *   node scripts/test-import-parse.mjs
 * Node strips the TypeScript types on the fly (v23.6+), so there is no build step.
 */
import assert from "node:assert/strict";
import {
  buildLookupIndex,
  normalizeKey,
  parseImportDate,
  resolveFk,
} from "../src/lib/importParse.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// --- normalizeKey ----------------------------------------------------------
check("normalizeKey strips accents, case and extra spaces", () => {
  assert.equal(normalizeKey("  Á f r i c a "), "á f r i c a".normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim());
  assert.equal(normalizeKey("BRASIL"), "brasil");
  assert.equal(normalizeKey("Portugal "), "portugal");
  assert.equal(normalizeKey("República  Tcheca"), "republica tcheca");
});

// --- buildLookupIndex / resolveFk -----------------------------------------
const pais = buildLookupIndex([
  { id: 7, label: "Brasil" },
  { id: 3, label: "Argentina" },
  { id: 41, label: "República Tcheca" },
]);
const bjcp = buildLookupIndex([
  { id: 63, label: "21A - American IPA" },
  { id: 30, label: "10A - Weissbier" },
]);

check("resolveFk accepts a valid numeric id", () => {
  assert.deepEqual(resolveFk("7", pais, "list_pais"), { id: 7 });
  assert.deepEqual(resolveFk(" 63 ", bjcp, "list_bjcp_21"), { id: 63 });
});

check("resolveFk rejects an id that is not in the table", () => {
  const r = resolveFk("999", pais, "list_pais");
  assert.ok("error" in r, "esperava erro para ID inexistente");
  assert.match(r.error, /não existe em list_pais/);
});

check("resolveFk falls back to an exact label, accent-insensitive", () => {
  assert.deepEqual(resolveFk("brasil", pais, "list_pais"), { id: 7 });
  assert.deepEqual(resolveFk("Republica Tcheca", pais, "list_pais"), { id: 41 });
  assert.deepEqual(resolveFk("10A - Weissbier", bjcp, "list_bjcp_21"), { id: 30 });
});

check("resolveFk never guesses an unknown label", () => {
  const r = resolveFk("Brasilandia", pais, "list_pais");
  assert.ok("error" in r);
  // A partial code must not silently pick one of the styles sharing it.
  assert.ok("error" in resolveFk("10A", bjcp, "list_bjcp_21"));
});

// --- parseImportDate -------------------------------------------------------
check("parseImportDate accepts ISO and returns it padded", () => {
  assert.equal(parseImportDate("2026-05-01"), "2026-05-01");
  assert.equal(parseImportDate("2026-5-1"), "2026-05-01");
});

check("parseImportDate accepts pt-BR day-first dates", () => {
  assert.equal(parseImportDate("14/03/2026"), "2026-03-14");
  assert.equal(parseImportDate("1.2.2020"), "2020-02-01");
  assert.equal(parseImportDate("31-12-2019"), "2019-12-31");
});

check("parseImportDate rejects impossible calendar dates", () => {
  assert.equal(parseImportDate("31/02/2026"), null);
  assert.equal(parseImportDate("2026-13-01"), null);
});

check("parseImportDate refuses ambiguous two-digit years", () => {
  assert.equal(parseImportDate("03/04/26"), null);
});

check("parseImportDate rejects junk and blanks", () => {
  assert.equal(parseImportDate(""), null);
  assert.equal(parseImportDate("ontem"), null);
  assert.equal(parseImportDate("45000"), null); // raw Excel serial, not a date string
});

console.log(`\n${passed} testes passaram.`);
