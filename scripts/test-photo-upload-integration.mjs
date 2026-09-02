import "./_loadEnv.mjs";
/**
 * Teste de integração do upload de foto (MIGRACAO_SHEETS.md seção 6/7 — "Upload de imagem nunca
 * foi implementado" até esta rodada) contra o Apps Script REAL: sobe um JPEG mínimo de verdade
 * pro Drive (driveUploadFile), confirma que as colunas de imagem do item foram gravadas com o
 * link/nome certos, e que uma tentativa de outro "usuário" sem permissão é recusada ANTES de
 * qualquer chamada ao Drive. Cria e apaga UM item de teste na aba `beer` e a foto que subiu,
 * sempre limpando no final (try/finally), mesmo padrão de test-items-sync-integration.mjs.
 *
 *   npx tsx --conditions=react-server scripts/test-photo-upload-integration.mjs
 */
import assert from "node:assert/strict";
import { createItem, deleteItem, getItemIfVisible, uploadItemPhoto } from "../src/lib/sheets/items.ts";
import { callAppsScript } from "../src/lib/sheets/client.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// JPEG 1x1 px vermelho real (não um mock) — pequeno o bastante pra não sujar o Drive de verdade,
// grande o bastante pra passar pelas mesmas validações (mimeType/base64) do fluxo real.
const JPEG_1X1_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

const DONO = "TESTE-INTEGRACAO-foto-dono";
const OUTRO = "TESTE-INTEGRACAO-foto-outro-sem-acesso";

let itemId = null;
let fileIdParaLimpar = null;

try {
  await check("cria item de teste na aba beer", async () => {
    const row = await createItem("beer", { beer_nome: "TESTE-INTEGRACAO-FOTO-APAGAR" }, DONO);
    itemId = row.id;
    assert.ok(itemId, "esperava um id");
  });

  await check("uploadItemPhoto recusa quem não tem permissão (não chega a chamar o Drive)", async () => {
    const result = await uploadItemPhoto("beer", itemId, OUTRO, {
      base64Data: JPEG_1X1_BASE64,
      mimeType: "image/jpeg",
      filename: "nao-deveria-subir.jpg",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "forbidden");
  });

  await check("uploadItemPhoto sobe a foto de verdade e grava img_url/img_nome", async () => {
    const result = await uploadItemPhoto("beer", itemId, DONO, {
      base64Data: JPEG_1X1_BASE64,
      mimeType: "image/jpeg",
      filename: "teste-integracao.jpg",
    });
    assert.equal(result.ok, true, "upload deveria ter dado certo com o dono do item");
    assert.match(result.url, /^https:\/\/lh3\.googleusercontent\.com\/d\//, "url deveria ser o link direto de imagem");
    assert.equal(result.imgNome, "teste-integracao.jpg");

    const m = /\/d\/([\w-]+)/.exec(result.url);
    fileIdParaLimpar = m?.[1] ?? null;
    assert.ok(fileIdParaLimpar, "deveria ter conseguido extrair o fileId da url pra poder limpar depois");
  });

  await check("a linha do item na planilha reflete a foto (readById)", async () => {
    const row = await getItemIfVisible("beer", itemId, DONO);
    assert.ok(row.beer_img_url?.includes(fileIdParaLimpar), "beer_img_url deveria conter o fileId que subiu");
    assert.equal(row.beer_img_nome, "teste-integracao.jpg");
  });
} finally {
  if (fileIdParaLimpar) {
    await callAppsScript("driveDeleteFile", { fileId: fileIdParaLimpar, categoria: "BEER", userId: DONO }).catch(
      (err) => console.error("  aviso: não consegui apagar a foto de teste do Drive:", err.message)
    );
  }
  if (itemId) {
    await deleteItem("beer", itemId, DONO).catch((err) =>
      console.error("  aviso: não consegui apagar o item de teste:", err.message)
    );
  }
}

console.log(`\n${passed} teste(s) passaram.`);
