/**
 * Decodificação e recompressão de imagem no navegador - a parte que quebrava em celular.
 *
 * Histórico (ver MIGRACAO_SHEETS.md 8.1/8.2 e 8.3): três rodadas de correção do upload de foto
 * falharam no aparelho do Carlos com "Não foi possível processar essa imagem.", sempre passando
 * no desktop. As três causas estruturais, resolvidas aqui:
 *
 * 1. `createImageBitmap(file)` sem opções decodifica o bitmap em resolução PLENA - uma foto de
 *    12 MP são ~48 MB de RGBA na memória antes de qualquer redução. Aqui a redução acontece
 *    DURANTE a decodificação (`resizeWidth`/`resizeHeight`), então o full-res nunca existe.
 *    Pra isso é preciso saber o tamanho antes de decodificar: `readJpegSize` lê do cabeçalho,
 *    sem tocar nos pixels.
 * 2. `canvas.toDataURL()` é síncrono e monta uma string base64 de vários MB de uma vez na thread
 *    principal - o passo mais caro do pipeline antigo. Trocado por `toBlob`/`convertToBlob`, que
 *    é assíncrono e devolve bytes, não texto.
 * 3. Não havia como saber POR QUE falhou: o erro real morria num `console.error` que ninguém lê
 *    num celular. Agora cada etapa registra o que fez (`steps`), e o laudo sobe junto com a
 *    falha.
 */

/** Marcadores SOF do JPEG que carregam as dimensões. Fora da lista: DHT (c4), JPG (c8), DAC (cc). */
function isSofMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Largura/altura declaradas no cabeçalho de um JPEG, sem decodificar a imagem. Devolve null pra
 * qualquer coisa que não seja um JPEG legível (PNG, WebP, HEIC, arquivo truncado) - quem chama
 * cai no caminho de decodificar em resolução plena.
 */
export function readJpegSize(bytes: ArrayBuffer): { width: number; height: number } | null {
  const view = new DataView(bytes);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null; // SOI

  let pos = 2;
  while (pos + 4 <= view.byteLength) {
    if (view.getUint8(pos) !== 0xff) return null; // fora de sincronia: não arrisca adivinhar
    const marker = view.getUint8(pos + 1);
    if (marker === 0xff) {
      pos += 1; // byte de preenchimento entre segmentos (permitido pelo padrão)
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2; // marcadores sem payload
      continue;
    }
    if (marker === 0xd9) return null; // fim da imagem sem nunca achar um SOF
    const size = view.getUint16(pos + 2, false);
    if (size < 2) return null;
    if (isSofMarker(marker)) {
      // SOF: length(2) precision(1) height(2) width(2)
      if (pos + 9 > view.byteLength) return null;
      const height = view.getUint16(pos + 5, false);
      const width = view.getUint16(pos + 7, false);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (marker === 0xda) return null; // começou o scan: não há mais cabeçalho pra ler
    pos += 2 + size;
  }
  return null;
}

/** Só os primeiros 128 KB importam: o SOF vem bem antes dos dados de imagem. */
const HEAD_BYTES = 128 * 1024;

/** Cabeçalho lido uma vez só e reaproveitado (assinatura + dimensões + decodificação). `erro`
 *  preenchido quando nem ler os bytes foi possível - o que já é um diagnóstico em si. */
export interface Cabecalho {
  bytes: ArrayBuffer | null;
  erro?: string;
}

export async function lerCabecalho(file: File): Promise<Cabecalho> {
  try {
    return { bytes: await file.slice(0, HEAD_BYTES).arrayBuffer() };
  } catch (err) {
    return { bytes: null, erro: descreveErro(err) };
  }
}

/** Dimensões do arquivo lidas do cabeçalho, quando o formato permite. Nunca lança. */
export function peekImageSize(head: Cabecalho): { width: number; height: number } | null {
  return head.bytes ? readJpegSize(head.bytes) : null;
}

/**
 * O que o arquivo REALMENTE é, pelos primeiros bytes.
 *
 * Existe porque nome e MIME mentem: o laudo de 2026-09-04 trouxe um arquivo chamado `.jpg`, com
 * `type: image/jpeg`, que nenhum decodificador do navegador abriu. Extensão e MIME vêm do provider
 * do Android (a Galeria, o Google Fotos), não do conteúdo - então a única fonte confiável são os
 * bytes.
 */
export interface Assinatura {
  /** "JPEG", "HEIF/HEIC", "AVIF", "PNG", "WebP", "GIF", "TIFF/RAW", "vazio", "desconhecido". */
  formato: string;
  /** Formatos que um navegador decodifica sozinho. HEIF e TIFF/RAW não entram. */
  decodificavel: boolean;
  /** Primeiros bytes em hex - o que vai pro laudo quando nada mais explica. */
  hex: string;
}

function ascii(view: DataView, inicio: number, tamanho: number): string {
  let s = "";
  for (let i = 0; i < tamanho && inicio + i < view.byteLength; i += 1) {
    s += String.fromCharCode(view.getUint8(inicio + i));
  }
  return s;
}

/** Marcas ISO-BMFF (a mesma caixa `ftyp` serve HEIF, HEIC e AVIF). */
const MARCAS_HEIF = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];
const MARCAS_AVIF = ["avif", "avis"];

export function sniffFormat(bytes: ArrayBuffer | null): Assinatura {
  if (!bytes || bytes.byteLength === 0) {
    return { formato: "vazio", decodificavel: false, hex: "(sem bytes)" };
  }
  const view = new DataView(bytes);
  const hex = Array.from(new Uint8Array(bytes.slice(0, 16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");

  const todosZero = new Uint8Array(bytes.slice(0, Math.min(64, bytes.byteLength))).every((b) => b === 0);
  if (todosZero) return { formato: "vazio", decodificavel: false, hex };

  const b = (i: number) => (i < view.byteLength ? view.getUint8(i) : -1);

  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { formato: "JPEG", decodificavel: true, hex };
  if (b(0) === 0x89 && ascii(view, 1, 3) === "PNG") return { formato: "PNG", decodificavel: true, hex };
  if (ascii(view, 0, 4) === "RIFF" && ascii(view, 8, 4) === "WEBP") {
    return { formato: "WebP", decodificavel: true, hex };
  }
  if (ascii(view, 0, 4) === "GIF8") return { formato: "GIF", decodificavel: true, hex };
  if (ascii(view, 4, 4) === "ftyp") {
    const marca = ascii(view, 8, 4).toLowerCase();
    if (MARCAS_AVIF.includes(marca)) return { formato: "AVIF", decodificavel: false, hex };
    if (MARCAS_HEIF.includes(marca)) return { formato: "HEIF/HEIC", decodificavel: false, hex };
    return { formato: `ISO-BMFF (${marca || "?"})`, decodificavel: false, hex };
  }
  // TIFF, e com ele os RAW de câmera (DNG, CR2, NEF) - nenhum navegador decodifica.
  if ((ascii(view, 0, 2) === "II" && b(2) === 0x2a) || (ascii(view, 0, 2) === "MM" && b(3) === 0x2a)) {
    return { formato: "TIFF/RAW", decodificavel: false, hex };
  }
  return { formato: "desconhecido", decodificavel: false, hex };
}

/** O que dá pra desenhar num canvas. `close()` libera a memória quando for um ImageBitmap. */
export type Drawable = ImageBitmap | HTMLImageElement;

export function drawableSize(img: Drawable): { width: number; height: number } {
  return img instanceof HTMLImageElement
    ? { width: img.naturalWidth, height: img.naturalHeight }
    : { width: img.width, height: img.height };
}

export function closeDrawable(img: Drawable): void {
  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) img.close();
}

/** Escala que faz o maior lado caber em `maxDim` (nunca amplia). */
function scaleFor(width: number, height: number, maxDim: number): number {
  return Math.min(1, maxDim / Math.max(width, height));
}

/**
 * Decodifica o arquivo já reduzido, quando o navegador e o formato permitirem.
 *
 * `resizeWidth`/`resizeHeight` fazem a redução acontecer dentro do decodificador - é o que evita
 * materializar o bitmap em resolução plena, e a diferença entre funcionar e a aba morrer num
 * celular com pouca RAM. Precisa das dimensões de antemão (`peekImageSize`); sem elas, decodifica
 * pleno mesmo, que é o comportamento antigo e serve pra PNG/WebP.
 *
 * `registrar` recebe uma linha por tentativa - é o que aparece no laudo de diagnóstico.
 */
export async function decodeImage(
  file: File,
  head: Cabecalho,
  maxDim: number,
  registrar: (linha: string) => void,
): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    const size = peekImageSize(head);
    if (size) {
      const scale = scaleFor(size.width, size.height, maxDim);
      if (scale < 1) {
        try {
          const bitmap = await createImageBitmap(file, {
            resizeWidth: Math.max(1, Math.round(size.width * scale)),
            resizeHeight: Math.max(1, Math.round(size.height * scale)),
            resizeQuality: "high",
          });
          registrar(`decode: bitmap reduzido na decodificação (${size.width}x${size.height} -> ${bitmap.width}x${bitmap.height})`);
          return bitmap;
        } catch (err) {
          // Navegador sem suporte às opções de resize (elas são ignoradas em alguns, mas outros
          // recusam) - tenta a decodificação simples antes de desistir.
          registrar(`decode: resize na decodificação recusado (${descreveErro(err)})`);
        }
      }
    } else {
      registrar("decode: cabeçalho sem dimensões (não é JPEG?) - decodificando pleno");
    }
    try {
      const bitmap = await createImageBitmap(file);
      registrar(`decode: bitmap pleno ${bitmap.width}x${bitmap.height}`);
      return bitmap;
    } catch (err) {
      registrar(`decode: createImageBitmap recusou o arquivo (${descreveErro(err)})`);
    }
  } else {
    registrar("decode: createImageBitmap indisponível neste navegador");
  }

  // Último caminho de decodificação: <img> + object URL. Alguns WebViews antigos só têm este.
  // Usa object URL (e não FileReader/base64) pra não construir uma string do arquivo inteiro.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("o navegador não decodificou este formato"));
      el.src = url;
    });
    registrar(`decode: <img> ${img.naturalWidth}x${img.naturalHeight}`);
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Canvas 2D, preferindo `OffscreenCanvas` (não entra na árvore do documento, custa menos). */
function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (ctx) return { canvas, ctx: ctx as OffscreenCanvasRenderingContext2D };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2D indisponível");
  return { canvas, ctx };
}

/**
 * Redimensiona e recomprime em JPEG, devolvendo um Blob.
 *
 * Assíncrono de propósito: `toBlob`/`convertToBlob` devolvem bytes sem passar por uma string
 * base64 gigante na thread principal, ao contrário do `toDataURL` que isto substitui.
 */
export async function encodeJpeg(img: Drawable, maxDim: number, quality: number): Promise<Blob> {
  const { width, height } = drawableSize(img);
  if (!width || !height) throw new Error("imagem sem dimensões");
  const scale = scaleFor(width, height, maxDim);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const { canvas, ctx } = makeCanvas(w, h);
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
  if (!blob) throw new Error("toBlob devolveu vazio");
  return blob;
}

/** Base64 puro (sem o prefixo `data:`) de um Blob. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("falha ao ler o blob"));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/** Mensagem curta e legível de um erro qualquer - vai pro laudo, então nada de stack. */
export function descreveErro(err: unknown): string {
  if (err instanceof DOMException || err instanceof Error) {
    return err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message;
  }
  return String(err);
}
