/**
 * Sanidade da leitura de data da foto (src/lib/photoDate.ts) — roda em Node puro, montando
 * JPEGs sintéticos com segmento EXIF byte a byte.
 *   node scripts/test-photo-date.mjs
 */
import assert from "node:assert/strict";
import { readExifDate, toDateInputValue, photoDateForInput } from "../src/lib/photoDate.ts";

let passed = 0;
function check(name, fn) {
  const r = fn();
  const done = () => {
    passed += 1;
    console.log(`  ok  ${name}`);
  };
  return r instanceof Promise ? r.then(done) : (done(), Promise.resolve());
}

/* ---------- construtores de JPEG/EXIF de teste ---------- */

const DATE_LEN = 20; // "YYYY:MM:DD HH:MM:SS\0"

/** Monta o bloco TIFF do EXIF com as tags de data pedidas. */
function buildTiff({ order = "II", dateTime, original, digitized }) {
  const little = order === "II";
  const sub = [];
  if (original) sub.push([0x9003, original]);
  if (digitized) sub.push([0x9004, digitized]);
  const ifd0 = [];
  if (dateTime) ifd0.push([0x0132, dateTime]);

  const ifd0Count = ifd0.length + (sub.length ? 1 : 0);
  const ifd0Start = 8;
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const subStart = ifd0Start + ifd0Size;
  const subSize = sub.length ? 2 + sub.length * 12 + 4 : 0;
  let dataPos = subStart + subSize;

  const total = dataPos + (ifd0.length + sub.length) * DATE_LEN;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  view.setUint16(0, little ? 0x4949 : 0x4d4d, false);
  view.setUint16(2, 0x002a, little);
  view.setUint32(4, ifd0Start, little);

  function writeAscii(text) {
    const at = dataPos;
    for (let i = 0; i < text.length; i += 1) bytes[at + i] = text.charCodeAt(i);
    bytes[at + text.length] = 0;
    dataPos += DATE_LEN;
    return at;
  }
  function writeEntries(start, entries, extra) {
    view.setUint16(start, entries.length + (extra ? 1 : 0), little);
    let e = start + 2;
    if (extra) {
      view.setUint16(e, extra.tag, little);
      view.setUint16(e + 2, 4, little); // LONG
      view.setUint32(e + 4, 1, little);
      view.setUint32(e + 8, extra.value, little);
      e += 12;
    }
    for (const [tag, text] of entries) {
      view.setUint16(e, tag, little);
      view.setUint16(e + 2, 2, little); // ASCII
      view.setUint32(e + 4, DATE_LEN, little);
      view.setUint32(e + 8, writeAscii(text), little);
      e += 12;
    }
    view.setUint32(e, 0, little); // sem próximo IFD
  }

  writeEntries(ifd0Start, ifd0, sub.length ? { tag: 0x8769, value: subStart } : null);
  if (sub.length) writeEntries(subStart, sub, null);
  return bytes;
}

/** Envelopa um bloco TIFF num JPEG mínimo (opcionalmente com um APP0/JFIF antes do APP1). */
function buildJpeg(tiff, { withJfif = false } = {}) {
  const parts = [Uint8Array.from([0xff, 0xd8, 0xff, 0xff])]; // SOI + bytes de preenchimento
  if (withJfif) {
    const jfif = new Uint8Array(2 + 2 + 14);
    jfif.set([0xff, 0xe0, 0x00, 0x10], 0);
    jfif.set([0x4a, 0x46, 0x49, 0x46, 0x00], 4); // "JFIF\0"
    parts.push(jfif);
  }
  if (tiff) {
    const size = 2 + 6 + tiff.length;
    const app1 = new Uint8Array(2 + size);
    app1.set([0xff, 0xe1, (size >> 8) & 0xff, size & 0xff], 0);
    app1.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4); // "Exif\0\0"
    app1.set(tiff, 10);
    parts.push(app1);
  }
  parts.push(Uint8Array.from([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])); // SOS + EOI
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const buffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

/* ---------- testes ---------- */

await check("lê DateTimeOriginal de JPEG little-endian (II)", () => {
  const jpeg = buildJpeg(buildTiff({ original: "2024:07:19 21:05:33" }));
  const d = readExifDate(buffer(jpeg));
  assert.equal(toDateInputValue(d), "2024-07-19");
  assert.equal(d.getHours(), 21);
});

await check("lê DateTimeOriginal de JPEG big-endian (MM)", () => {
  const jpeg = buildJpeg(buildTiff({ order: "MM", original: "1999:12:31 23:59:59" }));
  assert.equal(toDateInputValue(readExifDate(buffer(jpeg))), "1999-12-31");
});

await check("DateTimeOriginal ganha de DateTimeDigitized e do DateTime do IFD0", () => {
  const jpeg = buildJpeg(
    buildTiff({
      dateTime: "2020:01:01 00:00:00",
      original: "2018:03:04 10:00:00",
      digitized: "2019:05:06 10:00:00",
    }),
  );
  assert.equal(toDateInputValue(readExifDate(buffer(jpeg))), "2018-03-04");
});

await check("cai pro DateTime do IFD0 quando não há sub-IFD do EXIF", () => {
  const jpeg = buildJpeg(buildTiff({ dateTime: "2021:11:02 08:30:00" }));
  assert.equal(toDateInputValue(readExifDate(buffer(jpeg))), "2021-11-02");
});

await check("acha o EXIF mesmo com um APP0/JFIF antes", () => {
  const jpeg = buildJpeg(buildTiff({ original: "2023:02:14 12:00:00" }), { withJfif: true });
  assert.equal(toDateInputValue(readExifDate(buffer(jpeg))), "2023-02-14");
});

await check("JPEG sem EXIF, arquivo não-JPEG e lixo devolvem null sem quebrar", () => {
  assert.equal(readExifDate(buffer(buildJpeg(null))), null);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  assert.equal(readExifDate(buffer(png)), null);
  assert.equal(readExifDate(new ArrayBuffer(0)), null);
  assert.equal(readExifDate(buffer(Uint8Array.from([0xff, 0xd8, 0xff]))), null);
});

await check("EXIF truncado no meio não quebra (devolve null)", () => {
  const jpeg = buildJpeg(buildTiff({ original: "2022:06:06 06:06:06" }));
  for (const cut of [12, 20, 30, 40, jpeg.length - 25]) {
    assert.equal(readExifDate(buffer(jpeg.slice(0, cut))), null, `corte em ${cut} devia dar null`);
  }
});

await check("data com relógio zerado da câmera é descartada", () => {
  const jpeg = buildJpeg(buildTiff({ original: "0000:00:00 00:00:00" }));
  assert.equal(readExifDate(buffer(jpeg)), null);
});

await check("photoDateForInput: EXIF ganha do lastModified do arquivo", async () => {
  const jpeg = buildJpeg(buildTiff({ original: "2017:09:23 19:40:00" }));
  const file = new File([jpeg], "IMG_1234.jpg", {
    type: "image/jpeg",
    lastModified: Date.parse("2026-01-05T10:00:00"),
  });
  assert.equal(await photoDateForInput(file), "2017-09-23");
});

await check("photoDateForInput: sem EXIF cai pro lastModified", async () => {
  const file = new File([buildJpeg(null)], "captura.png", {
    type: "image/png",
    lastModified: new Date(2025, 4, 9, 15, 0, 0).getTime(),
  });
  assert.equal(await photoDateForInput(file), "2025-05-09");
});

await check("photoDateForInput: sem EXIF e sem data plausível devolve null", async () => {
  const semData = new File([buildJpeg(null)], "x.jpg", { type: "image/jpeg", lastModified: 0 });
  assert.equal(await photoDateForInput(semData), null);
  const futuro = new File([buildJpeg(null)], "x.jpg", {
    type: "image/jpeg",
    lastModified: Date.now() + 90 * 24 * 60 * 60 * 1000,
  });
  assert.equal(await photoDateForInput(futuro), null);
});

console.log(`\n${passed} verificações OK`);
