/**
 * beerLookup.ts - normalização de cervejaria e nome canônico a partir do catálogo.
 *   node scripts/test-beer-lookup.mjs
 */
import assert from "node:assert/strict";
import {
  normalizarCervejaria,
  acharCervejariaCanonica,
  nomeCompletoCerveja,
  normalizarEstilo,
  acharEstiloCanonico,
  construirDeParaEstiloBjcp,
  bjcpDoEstiloLivre,
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

check("acharEstiloCanonico: grafia mais frequente do catálogo", () => {
  const estilos = ["American IPA", "American IPA", "american ipa", "Witbier"];
  assert.equal(acharEstiloCanonico("IPA Americana", estilos), undefined); // texto diferente
  assert.equal(acharEstiloCanonico("american ipa", estilos), "American IPA");
  assert.equal(acharEstiloCanonico("Witbier", estilos), "Witbier");
  assert.equal(normalizarEstilo("Imperial Stout"), "imperial stout");
});

check("de/para estilo->BJCP das cervejas cadastradas", () => {
  const beers = [
    { category: "American IPA", bjcpId: "58" },
    { category: "American IPA", bjcpId: "58" },
    { category: "American IPA", bjcpId: "99" },
    { category: "Witbier", bjcpId: "42" },
    { category: "Puro Malte", bjcpId: "" }, // sem BJCP - não entra
  ];
  const mapa = construirDeParaEstiloBjcp(beers);
  assert.equal(bjcpDoEstiloLivre("American IPA", mapa), "58"); // 58 é o mais frequente
  assert.equal(bjcpDoEstiloLivre("american ipa", mapa), "58");
  assert.equal(bjcpDoEstiloLivre("Witbier", mapa), "42");
  assert.equal(bjcpDoEstiloLivre("Puro Malte", mapa), undefined);
  assert.equal(bjcpDoEstiloLivre("Estilo Novo", mapa), undefined);
});

console.log(`\n${passed} testes de beerLookup passaram.`);
