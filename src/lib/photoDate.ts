/**
 * Data em que a foto foi tirada, lida do próprio arquivo escolhido na galeria.
 *
 * Pedido do Carlos (2026-09-03): ao anexar uma foto, a data de degustação do item deve nascer da
 * foto — primeiro os metadados EXIF (`DateTimeOriginal`, gravado pela câmera), e se o arquivo não
 * tiver EXIF, a data do arquivo (`File.lastModified` — é a única data que o navegador expõe; não
 * existe API de "data de criação" no File API).
 *
 * Parser próprio de propósito: só precisamos de UMA tag do EXIF, e uma lib de EXIF completa
 * custaria uma dependência nova pra ~100 linhas de leitura de bytes.
 *
 * Limites conhecidos:
 * - Só JPEG tem EXIF lido aqui. PNG/WebP não têm EXIF de câmera; HEIC (iPhone) guarda o EXIF
 *   dentro de boxes ISO-BMFF, num formato bem mais complicado — nesses casos cai no lastModified.
 * - EXIF não guarda fuso: `DateTimeOriginal` é lido como horário local, que é o que interessa
 *   pra uma data de degustação.
 */

/** Só os primeiros 256 KB importam: o segmento EXIF vem logo depois do início do JPEG. */
const HEAD_BYTES = 256 * 1024;

const TAG_DATETIME = 0x0132; // IFD0: data de modificação do arquivo pela câmera/editor
const TAG_EXIF_IFD = 0x8769; // IFD0: ponteiro pro sub-IFD do EXIF
const TAG_DATETIME_ORIGINAL = 0x9003; // sub-IFD: quando a foto foi TIRADA (o que queremos)
const TAG_DATETIME_DIGITIZED = 0x9004; // sub-IFD: quando foi digitalizada

/** Descarta datas impossíveis (relógio zerado da câmera, arquivo sem lastModified). */
function isPlausible(date: Date | null): date is Date {
  if (!date) return false;
  const t = date.getTime();
  if (!Number.isFinite(t)) return false;
  const oneDayAhead = Date.now() + 24 * 60 * 60 * 1000; // tolera fuso/relógio adiantado
  return t > Date.UTC(1990, 0, 1) && t < oneDayAhead;
}

/** "2026:09:03 14:22:05" -> Date local. Devolve null pra qualquer coisa fora do formato. */
function parseExifDateString(raw: string): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  // Câmera sem relógio ajustado grava "0000:00:00 00:00:00" — vira uma data absurda, não uma
  // data inválida, então precisa do mesmo filtro de plausibilidade do lastModified.
  const date = new Date(y, mo - 1, d, h, mi, s);
  return isPlausible(date) ? date : null;
}

/** Lê uma string ASCII de um IFD (o valor cabe nos 4 bytes da entrada ou é um offset). */
function readAsciiValue(view: DataView, tiff: number, entry: number, little: boolean): string | null {
  const count = view.getUint32(entry + 4, little);
  if (count === 0 || count > 64) return null;
  let start = entry + 8;
  if (count > 4) {
    const offset = view.getUint32(entry + 8, little);
    start = tiff + offset;
  }
  if (start + count > view.byteLength) return null;
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const c = view.getUint8(start + i);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/** Percorre um IFD procurando as tags pedidas; devolve a primeira encontrada na ordem de `tags`. */
function findInIfd(
  view: DataView,
  tiff: number,
  ifd: number,
  little: boolean,
  tags: number[],
): Map<number, number> | null {
  if (ifd + 2 > view.byteLength) return null;
  const count = view.getUint16(ifd, little);
  const found = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    if (tags.includes(tag)) found.set(tag, entry);
  }
  return found;
}

/** Lê a data do bloco TIFF de um EXIF (já posicionado no "II"/"MM"). */
function readExifTiffDate(view: DataView, tiff: number): Date | null {
  if (tiff + 8 > view.byteLength) return null;
  const byteOrder = view.getUint16(tiff, false);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const little = byteOrder === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 0x002a) return null;

  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  const entries0 = findInIfd(view, tiff, ifd0, little, [TAG_EXIF_IFD, TAG_DATETIME]);
  if (!entries0) return null;

  // 1ª escolha: DateTimeOriginal / DateTimeDigitized, que só existem no sub-IFD do EXIF.
  const exifPointer = entries0.get(TAG_EXIF_IFD);
  if (exifPointer != null) {
    const subIfd = tiff + view.getUint32(exifPointer + 8, little);
    const entriesSub = findInIfd(view, tiff, subIfd, little, [
      TAG_DATETIME_ORIGINAL,
      TAG_DATETIME_DIGITIZED,
    ]);
    for (const tag of [TAG_DATETIME_ORIGINAL, TAG_DATETIME_DIGITIZED]) {
      const entry = entriesSub?.get(tag);
      if (entry == null) continue;
      const parsed = parseExifDateString(readAsciiValue(view, tiff, entry, little) ?? "");
      if (parsed) return parsed;
    }
  }

  // 2ª escolha: DateTime do IFD0 (algumas galerias reescrevem a foto e só mantêm essa).
  const dt = entries0.get(TAG_DATETIME);
  if (dt != null) {
    const parsed = parseExifDateString(readAsciiValue(view, tiff, dt, little) ?? "");
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Data EXIF de um JPEG (bytes do início do arquivo bastam). Devolve null se não for JPEG, se não
 * houver segmento EXIF ou se a data estiver corrompida.
 */
export function readExifDate(bytes: ArrayBuffer): Date | null {
  const view = new DataView(bytes);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null; // SOI

  let pos = 2;
  while (pos + 4 <= view.byteLength) {
    if (view.getUint8(pos) !== 0xff) break; // fora de sincronia: desiste em vez de adivinhar
    const marker = view.getUint8(pos + 1);
    if (marker === 0xff) {
      pos += 1; // byte de preenchimento entre segmentos (permitido pelo padrão)
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2; // marcadores sem payload
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // começou a imagem: não há mais metadados
    const size = view.getUint16(pos + 2, false);
    if (size < 2) break;
    if (marker === 0xe1 && pos + 4 + 6 <= view.byteLength) {
      // APP1: pode ser EXIF ("Exif\0\0") ou XMP ("http://ns.adobe.com/...") — só o EXIF interessa.
      let header = "";
      for (let i = 0; i < 6; i += 1) header += String.fromCharCode(view.getUint8(pos + 4 + i));
      if (header === "Exif\0\0") {
        const found = readExifTiffDate(view, pos + 10);
        if (found) return found;
      }
    }
    pos += 2 + size;
  }
  return null;
}

/** `Date` -> "yyyy-mm-dd" no fuso local (formato do <input type="date">). */
export function toDateInputValue(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * Quando a foto foi tirada: EXIF do arquivo e, na falta dele, a data do arquivo
 * (`lastModified`). Devolve "yyyy-mm-dd" pronto pro campo de data, ou null se nada for plausível.
 * Nunca lança — falha de leitura vira null e o fluxo de upload segue igual.
 */
export async function photoDateForInput(file: File): Promise<string | null> {
  let exif: Date | null = null;
  try {
    const head = await file.slice(0, HEAD_BYTES).arrayBuffer();
    exif = readExifDate(head);
  } catch {
    exif = null;
  }
  if (exif) return toDateInputValue(exif);

  const modified = file.lastModified ? new Date(file.lastModified) : null;
  if (isPlausible(modified)) return toDateInputValue(modified);
  return null;
}
