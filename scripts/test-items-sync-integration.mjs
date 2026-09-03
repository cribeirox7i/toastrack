import "./_loadEnv.mjs";
/**
 * Teste de integração da etapa 6 (cache local — MIGRACAO_SHEETS.md seção 5) contra o Apps Script
 * REAL: confirma que getItemsStamp é barato e reflete escritas, que listVisibleItemsSince só
 * devolve o delta, e que createItem ignora qualquer id vindo do cliente e atribui um id
 * sequencial próprio (decisão do Carlos 2026-09-02). Cria e apaga UM item de teste
 * na aba `beer`, sempre limpando no final (try/finally), mesmo padrão de
 * test-sheets-integration.mjs.
 *
 *   npx tsx --conditions=react-server scripts/test-items-sync-integration.mjs
 */
import assert from "node:assert/strict";
import {
  listVisibleItemsSince,
  getItemsStamp,
  createItem,
  deleteItem,
  getItemIfVisible,
} from "../src/lib/sheets/items.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const DONO = "TESTE-INTEGRACAO-sync-dono";
const ID_CLIENTE = "teste-integracao-sync-id-do-cliente";

let itemId = null;

try {
  let stamp1;
  await check("getItemsStamp devolve um carimbo não vazio (SyncMeta já tem entrada pro beer)", async () => {
    stamp1 = await getItemsStamp("beer");
    assert.ok(stamp1, "esperava um carimbo não vazio — SyncMeta deveria ter 'beer' desde a etapa 1");
  });

  await check("listVisibleItemsSince(desde o carimbo atual) não traz nada novo", async () => {
    const delta = await listVisibleItemsSince("beer", DONO, stamp1);
    assert.equal(delta.length, 0, "nada deveria ter mudado entre pegar o carimbo e checar o delta");
  });

  await check("createItem ignora o id do cliente e atribui um id sequencial", async () => {
    const row = await createItem(
      "beer",
      { id: ID_CLIENTE, beer_nome: "TESTE-INTEGRACAO-SYNC-APAGAR" },
      DONO
    );
    itemId = row.id;
    assert.notEqual(row.id, ID_CLIENTE, "o id do cliente nunca deve ser reaproveitado");
    assert.ok(/^\d+$/.test(row.id), `id deveria ser um inteiro sequencial, veio '${row.id}'`);
  });

  let stamp2;
  await check("getItemsStamp avança depois da escrita", async () => {
    stamp2 = await getItemsStamp("beer");
    assert.notEqual(stamp2, stamp1, "o carimbo deveria ter mudado depois de criar um item");
  });

  await check("listVisibleItemsSince(desde o carimbo antigo) traz só o item novo", async () => {
    const delta = await listVisibleItemsSince("beer", DONO, stamp1);
    assert.ok(delta.some((r) => r.id === itemId), "o delta deveria incluir o item recém-criado");
  });

  await check("listVisibleItemsSince(desde o carimbo novo) não traz mais nada", async () => {
    const delta = await listVisibleItemsSince("beer", DONO, stamp2);
    assert.equal(delta.length, 0, "nada deveria ter mudado depois do carimbo mais recente");
  });

  await check("deleteItem limpa o item de teste", async () => {
    const r = await deleteItem("beer", itemId, DONO);
    assert.equal(r, "ok");
    assert.equal(await getItemIfVisible("beer", itemId, DONO), null);
    itemId = null;
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
