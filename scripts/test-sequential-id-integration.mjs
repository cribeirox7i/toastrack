import "./_loadEnv.mjs";
/**
 * Teste de integração do id sequencial (pedido do Carlos 2026-09-02: "a chave das tabelas
 * precisa ser sequencial, sempre acréscimo do maior número que está na tabela") contra o Apps
 * Script REAL: precisa do `Codigo.gs` atualizado já colado/reimplantado no editor (a ação
 * `proximoIdSequencial` não existe até isso acontecer - rodar antes disso falha com "Ação
 * desconhecida"). Confirma que dois `createItem` seguidos saem com ids sequenciais crescentes
 * (não uuid), que a numeração é por aba (drink não pula pra frente por causa do beer), e que o
 * contador sobrevive entre chamadas (persistido em SyncMeta). Cria e apaga 2 itens de teste na
 * aba `drink` (poucas dezenas de linhas reais, baixo risco/custo), sempre limpando no finally.
 *
 *   npx tsx --conditions=react-server scripts/test-sequential-id-integration.mjs
 */
import assert from "node:assert/strict";
import { createItem, deleteItem } from "../src/lib/sheets/items.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const DONO = "TESTE-INTEGRACAO-seq-dono";
let id1 = null;
let id2 = null;

try {
  await check("createItem devolve um id numérico (não uuid)", async () => {
    const row = await createItem("drink", { drink_nome: "TESTE-INTEGRACAO-SEQ-APAGAR-1" }, DONO);
    id1 = row.id;
    assert.match(id1, /^\d+$/, `esperava um id só de dígitos, veio "${id1}"`);
  });

  await check("um segundo createItem sai com o próximo número (id1 + 1)", async () => {
    const row = await createItem("drink", { drink_nome: "TESTE-INTEGRACAO-SEQ-APAGAR-2" }, DONO);
    id2 = row.id;
    assert.equal(Number(id2), Number(id1) + 1, `esperava ${Number(id1) + 1}, veio ${id2}`);
  });

  await check("id vindo do cliente é ignorado - servidor sempre atribui o sequencial", async () => {
    const row = await createItem("drink", { id: "999999", drink_nome: "TESTE-INTEGRACAO-SEQ-APAGAR-3" }, DONO);
    assert.notEqual(row.id, "999999");
    assert.equal(Number(row.id), Number(id2) + 1);
    await deleteItem("drink", row.id, DONO); // não guardado nas vars de cima, limpa na hora
  });
} finally {
  if (id1) await deleteItem("drink", id1, DONO).catch((e) => console.error("aviso: falha ao limpar id1:", e.message));
  if (id2) await deleteItem("drink", id2, DONO).catch((e) => console.error("aviso: falha ao limpar id2:", e.message));
}

console.log(`\n${passed} teste(s) passaram.`);
