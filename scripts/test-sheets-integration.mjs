/**
 * Teste de integração de src/lib/sheets/ contra o Apps Script REAL (lê .env.local). Cria UM item
 * de teste na aba `beer` de verdade, exercita leitura/permissão/edição/compartilhamento, e apaga
 * no final — mesmo com falha no meio (try/finally), pra nunca deixar lixo nas 3591 cervejas reais.
 *
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/test-sheets-integration.mjs
 *
 * tsx (devDependency) resolve os imports relativos sem extensão do jeito que o bundler do Next.js
 * resolve — o type-stripping nativo do Node não aceita isso (exige ".ts" explícito), e adicionar
 * ".ts" nos arquivos-fonte quebra o `tsc` do projeto (moduleResolution "bundler" rejeita extensão
 * explícita sem allowImportingTsExtensions). --env-file carrega o .env.local. --conditions=react-
 * server é necessário porque os módulos importam "server-only", que lança erro fora do bundler do
 * Next.js a menos que essa condição esteja ativa (ela resolve pro empty.js do pacote em vez do
 * index.js que lança).
 */
import assert from "node:assert/strict";
import {
  listVisibleItems,
  getItemIfVisible,
  createItem,
  updateItem,
  deleteItem,
} from "../src/lib/sheets/items.ts";
import { fetchPaises, fetchBjcp } from "../src/lib/sheets/lookups.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const DONO = "TESTE-INTEGRACAO-dono";
const ESTRANHO = "TESTE-INTEGRACAO-estranho";
const CONVIDADO_LEITURA = "TESTE-INTEGRACAO-convidado";

let itemId = null;

try {
  await check("fetchPaises devolve as 40 linhas reais", async () => {
    const paises = await fetchPaises();
    assert.ok(paises.length >= 40, `esperava >=40, veio ${paises.length}`);
    assert.ok(paises.some((p) => p.pais_nome === "Brasil"));
  });

  await check("fetchBjcp devolve as 129 linhas reais", async () => {
    const bjcp = await fetchBjcp();
    assert.ok(bjcp.length >= 129, `esperava >=129, veio ${bjcp.length}`);
  });

  await check("createItem grava dono calculado, ignora o que o payload mandar", async () => {
    const row = await createItem(
      "beer",
      { beer_nome: "TESTE-INTEGRACAO-APAGAR", user_owner: "alguem-forjado" },
      DONO
    );
    itemId = row.id;
    assert.equal(row.user_owner, DONO, "user_owner tem que vir da sessão, não do payload");
    // O dono não precisa aparecer em user_edit — canWrite já libera por user_owner === sessão;
    // ensureInEditList só some ali quando quem cria NÃO é o dono (payload.user_edit compartilhado
    // por outra rota, por exemplo). Aqui, sem ninguém a mais, a lista fica vazia mesmo.
    assert.equal(row.user_edit, "", "sem dono duplicado em user_edit");
    assert.match(row.id, /^[0-9a-f-]{36}$/, "id deve ser um UUID");
  });

  await check("dono vê e estranho não vê na listagem", async () => {
    const doDono = await listVisibleItems("beer", DONO);
    const doEstranho = await listVisibleItems("beer", ESTRANHO);
    assert.ok(doDono.some((r) => r.id === itemId));
    assert.ok(!doEstranho.some((r) => r.id === itemId));
  });

  await check("getItemIfVisible: dono vê, estranho recebe null", async () => {
    assert.ok(await getItemIfVisible("beer", itemId, DONO));
    assert.equal(await getItemIfVisible("beer", itemId, ESTRANHO), null);
  });

  await check("updateItem: estranho é forbidden, dono consegue editar", async () => {
    const r1 = await updateItem("beer", itemId, { beer_nota: "5" }, ESTRANHO);
    assert.equal(r1, "forbidden");
    const r2 = await updateItem("beer", itemId, { beer_nota: "5" }, DONO);
    assert.equal(r2, "ok");
    const atualizado = await getItemIfVisible("beer", itemId, DONO);
    assert.equal(atualizado.beer_nota, "5");
  });

  await check("updateItem ignora tentativa de trocar user_owner pelo patch", async () => {
    await updateItem("beer", itemId, { user_owner: ESTRANHO }, DONO);
    const row = await getItemIfVisible("beer", itemId, DONO);
    assert.equal(row.user_owner, DONO, "user_owner não pode mudar via patch");
  });

  await check("compartilhar via user_access dá leitura mas não escrita", async () => {
    await updateItem("beer", itemId, { user_access: CONVIDADO_LEITURA }, DONO);
    const visivel = await getItemIfVisible("beer", itemId, CONVIDADO_LEITURA);
    assert.ok(visivel, "convidado por user_access deveria enxergar o item");
    const tentativaEdicao = await updateItem("beer", itemId, { beer_nota: "1" }, CONVIDADO_LEITURA);
    assert.equal(tentativaEdicao, "forbidden", "user_access não deveria dar permissão de escrita");
  });

  await check("deleteItem: estranho é forbidden, dono apaga de verdade", async () => {
    const r1 = await deleteItem("beer", itemId, ESTRANHO);
    assert.equal(r1, "forbidden");
    const r2 = await deleteItem("beer", itemId, DONO);
    assert.equal(r2, "ok");
    const depoisDeApagar = await getItemIfVisible("beer", itemId, DONO);
    assert.equal(depoisDeApagar, null);
    itemId = null; // já limpo, o finally não precisa fazer nada
  });

  console.log(`\n${passed} testes passaram.`);
} finally {
  if (itemId) {
    console.log(`\nLimpando item de teste ${itemId} que sobrou de uma falha no meio...`);
    await deleteItem("beer", itemId, DONO).catch((e) => {
      console.error("FALHA AO LIMPAR — apague manualmente na planilha:", itemId, e);
    });
  }
}
