/**
 * Sanidade do leitor de dimensões de JPEG (src/lib/imageDecode.ts) - roda em Node puro, montando
 * cabeçalhos JPEG byte a byte.
 *   node scripts/test-image-decode.mjs
 *
 * Só esta parte do módulo é testável fora do navegador: decodificação e recompressão dependem de
 * createImageBitmap/canvas, que o Node não tem. Mas é justamente a parte "difícil de acertar" -
 * é ela que permite reduzir a foto DURANTE a decodificação (ver decodeImage), que é o que faz o
 * upload parar de morrer por memória em celular.
 */
import assert from "node:assert/strict";
import { readJpegSize, sniffFormat, readJpegOrientation, orientationSwapsAxes } from "../src/lib/imageDecode.ts";

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

/* ---------- assinatura pelos bytes ---------- */

/** Bytes soltos -> ArrayBuffer, completando com zeros até `total` (o sniff olha até 16 bytes). */
function bytes(lista, total = 32) {
  const a = new Uint8Array(total);
  a.set(lista);
  return a.buffer;
}

/** Caixa ISO-BMFF: size(4) "ftyp" marca(4). */
function ftyp(marca) {
  return bytes([
    0x00, 0x00, 0x00, 0x20,
    ...[..."ftyp"].map((c) => c.charCodeAt(0)),
    ...[...marca].map((c) => c.charCodeAt(0)),
  ]);
}

check("assinatura: JPEG de verdade", () => {
  assert.equal(sniffFormat(bytes([0xff, 0xd8, 0xff, 0xe0])).formato, "JPEG");
  assert.equal(sniffFormat(bytes([0xff, 0xd8, 0xff, 0xe0])).decodificavel, true);
});

check("assinatura: HEIC não decodificável (o caso do .jpg que não era JPEG)", () => {
  const r = sniffFormat(ftyp("heic"));
  assert.equal(r.formato, "HEIF/HEIC");
  assert.equal(r.decodificavel, false);
  assert.match(r.hex, /^00 00 00 20 66 74 79 70/); // hex vai pro laudo
});

check("assinatura: mif1 (HEIF genérico) e AVIF", () => {
  assert.equal(sniffFormat(ftyp("mif1")).formato, "HEIF/HEIC");
  assert.equal(sniffFormat(ftyp("avif")).formato, "AVIF");
});

check("assinatura: ISO-BMFF de marca desconhecida ainda é identificado", () => {
  assert.equal(sniffFormat(ftyp("qt  ")).formato, "ISO-BMFF (qt  )");
});

check("assinatura: PNG, WebP e GIF", () => {
  assert.equal(sniffFormat(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).formato, "PNG");
  assert.equal(
    sniffFormat(
      bytes([
        ...[..."RIFF"].map((c) => c.charCodeAt(0)),
        0x00, 0x00, 0x00, 0x00,
        ...[..."WEBP"].map((c) => c.charCodeAt(0)),
      ]),
    ).formato,
    "WebP",
  );
  assert.equal(sniffFormat(bytes([...[..."GIF89a"].map((c) => c.charCodeAt(0))])).formato, "GIF");
});

check("assinatura: TIFF/RAW (nenhum navegador abre)", () => {
  const r = sniffFormat(bytes([0x49, 0x49, 0x2a, 0x00]));
  assert.equal(r.formato, "TIFF/RAW");
  assert.equal(r.decodificavel, false);
});

check("assinatura: arquivo zerado ou sem bytes vira 'vazio'", () => {
  // É o que aparece quando o provider do Android entrega um arquivo que não dá pra ler de fato
  // (foto só na nuvem, permissão negada) - diagnóstico diferente de "formato não suportado".
  assert.equal(sniffFormat(bytes([])).formato, "vazio");
  assert.equal(sniffFormat(null).formato, "vazio");
  assert.equal(sniffFormat(new ArrayBuffer(0)).formato, "vazio");
});

check("assinatura: bytes que não batem com nada", () => {
  assert.equal(sniffFormat(bytes([0x12, 0x34, 0x56, 0x78])).formato, "desconhecido");
});

/* ---------- orientação EXIF ---------- */

/** TIFF mínimo com só a tag Orientation (0x0112, SHORT) no IFD0. */
function tiffComOrientacao(valor, little = true) {
  const ifd0Start = 8;
  const buf = new ArrayBuffer(ifd0Start + 2 + 12 + 4);
  const view = new DataView(buf);
  view.setUint16(0, little ? 0x4949 : 0x4d4d, false);
  view.setUint16(2, 0x002a, little);
  view.setUint32(4, ifd0Start, little);
  view.setUint16(ifd0Start, 1, little); // 1 entrada
  const entry = ifd0Start + 2;
  view.setUint16(entry, 0x0112, little); // tag Orientation
  view.setUint16(entry + 2, 3, little); // type SHORT
  view.setUint32(entry + 4, 1, little); // count
  view.setUint16(entry + 8, valor, little); // valor cabe nos 4 bytes
  view.setUint32(entry + 12, 0, little); // sem próximo IFD
  return new Uint8Array(buf);
}

/** JPEG mínimo com SOI + APP1(Exif) + o TIFF acima. */
function jpegComOrientacao(valor, little = true) {
  const tiff = tiffComOrientacao(valor, little);
  const exifHeader = Uint8Array.from([...[..."Exif\0\0"].map((c) => c.charCodeAt(0))]);
  const app1Payload = new Uint8Array(exifHeader.length + tiff.length);
  app1Payload.set(exifHeader, 0);
  app1Payload.set(tiff, exifHeader.length);
  const app1Size = app1Payload.length + 2;
  const app1 = new Uint8Array(4 + app1Payload.length);
  app1.set([0xff, 0xe1, (app1Size >> 8) & 0xff, app1Size & 0xff], 0);
  app1.set(app1Payload, 4);
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xd9]).buffer;
}

check("orientação: sem EXIF -> 1 (normal)", () => {
  assert.equal(readJpegOrientation(jpeg(sof(0xc0, 100, 100))), 1);
});

check("orientação: Orientation=6 (retrato, sensor deitado 90° horário)", () => {
  assert.equal(readJpegOrientation(jpegComOrientacao(6)), 6);
  assert.equal(orientationSwapsAxes(6), true);
});

check("orientação: Orientation=8 também troca os eixos; 3 (180°) não troca", () => {
  assert.equal(orientationSwapsAxes(8), true);
  assert.equal(orientationSwapsAxes(3), false);
  assert.equal(orientationSwapsAxes(1), false);
});

check("orientação: big-endian (MM) lido igual a little-endian (II)", () => {
  assert.equal(readJpegOrientation(jpegComOrientacao(6, false)), 6);
});

check("orientação: valor fora de 1-8 é descartado, cai pro padrão 1", () => {
  assert.equal(readJpegOrientation(jpegComOrientacao(0)), 1);
});

console.log(`\n${passed} testes de leitura de cabeçalho de imagem passaram.`);
