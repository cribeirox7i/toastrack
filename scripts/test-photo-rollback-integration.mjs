import "./_loadEnv.mjs";
/**
 * Teste de integração do ROLLBACK de foto (`removeItemPhoto`) contra o Drive/planilha REAIS:
 * anexar uma foto e cancelar a edição tem que apagar o arquivo do Drive e devolver as colunas de
 * imagem ao que eram antes — antes disso o arquivo ficava lá pra sempre mesmo quando o item nunca
 * chegou a ser salvo (pergunta do Carlos 2026-09-03: "se o usuário cancelar, a foto faz
 * rollback?"). Cria e apaga UM item de teste na aba `beer`, sempre limpando no finally.
 *
 *   npx tsx --conditions=react-server scripts/test-photo-rollback-integration.mjs
 */
import assert from "node:assert/strict";
import { createItem, deleteItem, removeItemPhoto, uploadItemPhoto } from "../src/lib/sheets/items.ts";
import { callAppsScript } from "../src/lib/sheets/client.ts";

const JPEG_1X1_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

const DONO = "TESTE-INTEGRACAO-rollback-dono";
const OUTRO = "TESTE-INTEGRACAO-rollback-outro";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const foto = (nome) => ({ base64Data: JPEG_1X1_BASE64, mimeType: "image/jpeg", filename: nome });
const lerLinha = (id) => callAppsScript("readById", { tab: "beer", id });
const listar = () => callAppsScript("driveListFiles", { categoria: "BEER", userId: DONO });

let itemId = null;
try {
  const row = await createItem("beer", { beer_nome: "TESTE-INTEGRACAO-ROLLBACK-APAGAR" }, DONO);
  itemId = row.id;

  let primeira = null;
  let segunda = null;

  await check("sobe duas fotos seguidas (a segunda substitui a primeira nas colunas)", async () => {
    primeira = await uploadItemPhoto("beer", itemId, DONO, foto("rollback-1.jpg"));
    segunda = await uploadItemPhoto("beer", itemId, DONO, foto("rollback-2.jpg"));
    assert.equal(primeira.ok, true);
    assert.equal(segunda.ok, true);
    const linha = await lerLinha(itemId);
    assert.equal(linha.beer_img_url, segunda.url);
    assert.equal(linha.beer_img_nome, "rollback-2.jpg");
  });

  await check("quem não tem permissão não consegue desfazer (nem toca no Drive)", async () => {
    const negado = await removeItemPhoto("beer", itemId, OUTRO);
    assert.equal(negado.ok, false);
    assert.equal(negado.reason, "forbidden");
    const linha = await lerLinha(itemId);
    assert.equal(linha.beer_img_url, segunda.url, "a foto tinha que continuar lá");
    const nomes = (await listar()).map((f) => f.name);
    assert.ok(nomes.includes("rollback-2.jpg"), "o arquivo não podia ter sido apagado");
  });

  await check("desfazer restaurando: apaga a foto nova do Drive e devolve a anterior", async () => {
    const r = await removeItemPhoto("beer", itemId, DONO, { url: primeira.url, nome: "rollback-1.jpg" });
    assert.equal(r.ok, true);
    const linha = await lerLinha(itemId);
    assert.equal(linha.beer_img_url, primeira.url);
    assert.equal(linha.beer_img_nome, "rollback-1.jpg");
    const nomes = (await listar()).map((f) => f.name);
    assert.ok(!nomes.includes("rollback-2.jpg"), "rollback-2.jpg devia ter ido pro lixo do Drive");
    assert.ok(nomes.includes("rollback-1.jpg"), "rollback-1.jpg não podia ter sido tocada");
  });

  await check("desfazer sem restaurar (rascunho cancelado): colunas vazias e Drive limpo", async () => {
    const r = await removeItemPhoto("beer", itemId, DONO);
    assert.equal(r.ok, true);
    const linha = await lerLinha(itemId);
    assert.equal(linha.beer_img_url, "");
    assert.equal(linha.beer_img_nome, "");
    const nomes = (await listar()).map((f) => f.name);
    assert.deepEqual(nomes.filter((n) => n.startsWith("rollback-")), [], "não podia sobrar foto de teste");
  });

  await check("desfazer num item sem foto nenhuma não quebra", async () => {
    const r = await removeItemPhoto("beer", itemId, DONO);
    assert.equal(r.ok, true);
  });

  console.log(`\n${passed} teste(s) passaram.`);
} finally {
  if (itemId) {
    await deleteItem("beer", itemId);
    console.log(`(limpeza: item ${itemId} apagado)`);
  }
  const restos = await listar().catch(() => []);
  for (const f of restos.filter((x) => x.name.startsWith("rollback-"))) {
    await callAppsScript("driveDeleteFile", { fileId: f.fileId, categoria: "BEER", userId: DONO });
    console.log(`(limpeza: ${f.name} apagada do Drive)`);
  }
}
