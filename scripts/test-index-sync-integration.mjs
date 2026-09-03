import "./_loadEnv.mjs";
/**
 * Teste de integração da sincronização por índice (decisão do Carlos 2026-09-03) contra o Apps
 * Script REAL. O que ele prova, na ordem:
 *
 * 1. `readIndex` está publicado no Web App (sem isso o app cai num fallback que não resolve nada);
 * 2. o índice é MUITO menor que a aba inteira — é a razão de existir da mudança;
 * 3. o índice cobre as mesmas linhas que a leitura completa;
 * 4. `readByIds` devolve só o que foi pedido;
 * 5. o hash muda quando a linha é editada POR FORA do app, sem tocar `updated_at` — é isso que
 *    faz uma edição manual na planilha finalmente aparecer;
 * 6. uma linha excluída some do índice (fecha o caso do item "fantasma").
 *
 * Cria e apaga UM item de teste na aba `wine` (pequena), sempre limpando no finally.
 *
 *   npm run test:index-sync-integration
 */
import assert from "node:assert/strict";
import { callAppsScript } from "../src/lib/sheets/client.ts";
import { createItem, deleteItem } from "../src/lib/sheets/items.ts";

const DONO = "TESTE-INTEGRACAO-indice-dono";
const TAB = "wine";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

let itemId = null;

try {
  let indice;
  await check("readIndex está publicado e devolve id + hash", async () => {
    indice = await callAppsScript("readIndex", { tab: TAB });
    assert.ok(Array.isArray(indice) && indice.length > 0, "índice veio vazio");
    assert.ok(indice[0].id !== undefined, "faltou id no índice");
    assert.ok(typeof indice[0].h === "string" && indice[0].h.length > 0, "faltou hash no índice");
  });

  await check("o índice é bem menor que a aba inteira (é o motivo da mudança)", async () => {
    const completo = await callAppsScript("read", { tab: TAB });
    const bytesIndice = JSON.stringify(indice).length;
    const bytesCompleto = JSON.stringify(completo).length;
    console.log(
      `      ${TAB}: índice ${(bytesIndice / 1024).toFixed(1)} KB vs aba inteira ${(bytesCompleto / 1024).toFixed(1)} KB ` +
        `(${(bytesCompleto / bytesIndice).toFixed(1)}x menor)`
    );
    assert.ok(bytesIndice * 2 < bytesCompleto, "o índice deveria ser bem menor que a aba inteira");
    assert.equal(indice.length, completo.length, "índice e aba inteira deveriam ter as mesmas linhas");
  });

  await check("createItem entra no índice", async () => {
    const row = await createItem(TAB, { wine_nome: "TESTE-INDICE-APAGAR" }, DONO);
    itemId = row.id;
    const depois = await callAppsScript("readIndex", { tab: TAB });
    assert.ok(depois.some((e) => String(e.id) === String(itemId)), "o item novo deveria estar no índice");
  });

  let hashAntes;
  await check("readByIds devolve só o que foi pedido", async () => {
    const rows = await callAppsScript("readByIds", { tab: TAB, ids: [itemId] });
    assert.equal(rows.length, 1, `esperava 1 linha, veio ${rows.length}`);
    assert.equal(String(rows[0].id), String(itemId));
    assert.equal(rows[0].wine_nome, "TESTE-INDICE-APAGAR");
    const idx = await callAppsScript("readIndex", { tab: TAB });
    hashAntes = idx.find((e) => String(e.id) === String(itemId)).h;
  });

  await check("o hash muda com edição feita fora do app (sem tocar updated_at)", async () => {
    await callAppsScript("updateById", {
      tab: TAB,
      id: itemId,
      patch: { wine_nome: "TESTE-INDICE-EDITADO-NA-MAO" },
    });
    const idx = await callAppsScript("readIndex", { tab: TAB });
    const hashDepois = idx.find((e) => String(e.id) === String(itemId)).h;
    assert.notEqual(hashDepois, hashAntes, "o hash deveria mudar quando o conteúdo da linha muda");
  });

  await check("linha excluída some do índice", async () => {
    const r = await deleteItem(TAB, itemId, DONO);
    assert.equal(r, "ok");
    const idx = await callAppsScript("readIndex", { tab: TAB });
    assert.ok(!idx.some((e) => String(e.id) === String(itemId)), "o item apagado não deveria estar no índice");
    itemId = null;
  });

  console.log(`\n${passed} testes passaram.`);
} finally {
  if (itemId) {
    console.log(`\nLimpando item de teste ${itemId} que sobrou de uma falha no meio...`);
    await deleteItem(TAB, itemId, DONO).catch((e) => {
      console.error("FALHA AO LIMPAR — apague manualmente na planilha:", itemId, e);
    });
  }
}
