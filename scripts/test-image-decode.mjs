/**
 * Sanidade do leitor de dimensões de JPEG (src/lib/imageDecode.ts) — roda em Node puro, montando
 * cabeçalhos JPEG byte a byte.
 *   node scripts/test-image-decode.mjs
 *
 * Só esta parte do módulo é testável fora do navegador: decodificação e recompressão dependem de
 * createImageBitmap/canvas, que o Node não tem. Mas é justamente a parte "difícil de acertar" —
 * é ela que permite reduzir a foto DURANTE a decodificação (ver decodeImage), que é o que faz o
 * upload parar de morrer por memória em celular.
 */
import assert from "node:assert/strict";
import { readJpegSize } from "../src/lib/imageDecode.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/* ---------- construtores de JPEG de teste ---------- */

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

/** Segmento genérico: FF <marker> <len:2> <payload...> (len inclui os 2 bytes do próprio len). */
function segment(marker, payload = []) {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}

/** SOF: precision(1) height(2) width(2) ncomp(1) + 3 bytes por componente. */
function sof(marker, width, height) {
  return segment(marker, [
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ]);
}

function jpeg(...parts) {
  return new Uint8Array([...SOI, ...parts.flat(), ...EOI]).buffer;
}

/* ---------- testes ---------- */

check("SOF0 logo após o SOI", () => {
  assert.deepEqual(readJpegSize(jpeg(sof(0xc0, 4032, 3024))), { width: 4032, height: 3024 });
});

check("pula APP0/APP1 antes do SOF (caso real: JFIF + EXIF)", () => {
  const app0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]);
  const app1 = segment(0xe1, new Array(120).fill(0x00));
  assert.deepEqual(readJpegSize(jpeg(app0, app1, sof(0xc0, 1200, 1600))), {
    width: 1200,
    height: 1600,
  });
});

check("SOF2 (JPEG progressivo) também conta", () => {
  assert.deepEqual(readJpegSize(jpeg(sof(0xc2, 800, 600))), { width: 800, height: 600 });
});

check("DHT (0xc4) não é confundido com SOF", () => {
  // 0xc4 cai na faixa 0xc0-0xcf mas é tabela de Huffman: se fosse lido como SOF, as dimensões
  // sairiam do lixo do payload em vez do SOF verdadeiro que vem depois.
  const dht = segment(0xc4, new Array(30).fill(0x7f));
  assert.deepEqual(readJpegSize(jpeg(dht, sof(0xc0, 640, 480))), { width: 640, height: 480 });
});

check("byte de preenchimento 0xff entre segmentos é tolerado", () => {
  const bytes = new Uint8Array([...SOI, 0xff, ...sof(0xc0, 300, 200), ...EOI]).buffer;
  assert.deepEqual(readJpegSize(bytes), { width: 300, height: 200 });
});

check("não é JPEG -> null", () => {
  assert.equal(readJpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null); // PNG
  assert.equal(readJpegSize(new Uint8Array([]).buffer), null);
});

check("SOS antes de qualquer SOF -> null (nada de adivinhar)", () => {
  assert.equal(readJpegSize(jpeg(segment(0xda, [0x01, 0x01, 0x00]))), null);
});

check("cabeçalho truncado no meio do SOF -> null", () => {
  const truncado = new Uint8Array([...SOI, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x0b]).buffer;
  assert.equal(readJpegSize(truncado), null);
});

check("dimensão zero é recusada", () => {
  assert.equal(readJpegSize(jpeg(sof(0xc0, 0, 480))), null);
});

console.log(`\n${passed} testes de leitura de dimensão de JPEG passaram.`);
