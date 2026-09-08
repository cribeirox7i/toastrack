/**
 * beerLookup.ts - normalização de cervejaria e nome canônico a partir do catálogo.
 *   node scripts/test-beer-lookup.mjs
 */
import assert from "node:assert/strict";
import {
  normalizarCervejaria,
  acharCervejariaCanonica,
  nomeCompletoCerveja,
} from "../src/lib/beerLookup.ts";

let passed = 0;
function check(nome, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${nome}`);
}

check("normalizarCervejaria: caixa, acento e palavras genéricas somem", () => {
  assert.equal(normalizarCervejaria("Cervejaria Antuérpia"), "antuerpia");
  assert.equal(normalizarCervejaria("ANTUERPIA"), "antuerpia");
  assert.equal(normalizarCervejaria("Antuérpia Brewing Co."), "antuerpia");
  assert.equal(normalizarCervejaria("  Bodebrown  "), "bodebrown");
});

const CATALOGO = [
  { manufacturer: "Antuérpia", country: "Brasil" },
  { manufacturer: "Antuérpia", country: "Brasil" },
  { manufacturer: "Cervejaria Antuérpia", country: "Brasil" },
  { manufacturer: "Colorado", country: "Brasil" },
  { manufacturer: "Stone Brewing", country: "Estados Unidos" },
];

check("acharCervejariaCanonica: grafia mais frequente + país mais comum", () => {
  const r = acharCervejariaCanonica("CERVEJARIA ANTUERPIA", CATALOGO);
  assert.equal(r?.nome, "Antuérpia");
  assert.equal(r?.paisNome, "Brasil");
  assert.equal(r?.ocorrencias, 3);
});

check("acharCervejariaCanonica: casa por conter (rótulo diz mais que a tabela)", () => {
  const r = acharCervejariaCanonica("Stone", CATALOGO);
  assert.equal(r?.nome, "Stone Brewing");
  assert.equal(r?.paisNome, "Estados Unidos");
});

check("acharCervejariaCanonica: cervejaria nova -> undefined", () => {
  assert.equal(acharCervejariaCanonica("Cervejaria Nova Xyz", CATALOGO), undefined);
  assert.equal(acharCervejariaCanonica("ab", CATALOGO), undefined); // curto demais
});

check("nomeCompletoCerveja: cervejaria + produto", () => {
  assert.equal(nomeCompletoCerveja("Antuérpia", "Puro Malte", "Puro Malte"), "Antuérpia Puro Malte");
  assert.equal(nomeCompletoCerveja("Antuérpia", "", "Weiss"), "Antuérpia Weiss");
});

check("nomeCompletoCerveja: não duplica se o produto já traz a cervejaria", () => {
  assert.equal(nomeCompletoCerveja("Colorado", "Colorado Appia", "Witbier"), "Colorado Appia");
});

check("nomeCompletoCerveja: sem cervejaria devolve só o resto", () => {
  assert.equal(nomeCompletoCerveja("", "Petroleum", "Imperial Stout"), "Petroleum");
});

console.log(`\n${passed} testes de beerLookup passaram.`);
