import { IMG_URL_COL, TYPE_TAB, type ItemType } from "@/lib/catalog";
import { applyServerPatch, type ItemTab } from "@/lib/offline/sync";
import { SCHEMA } from "@/lib/itemSchema";

/**
 * Upload de foto de item (etapa "fora de escopo" da migração original — ver MIGRACAO_SHEETS.md
 * seção 7, etapa 6: img_url/img_nome sempre existiram na planilha, nenhuma tela subia foto nova).
 * Sem outbox/offline de propósito (mesmo motivo documentado em src/lib/offline/sync.ts): precisa
 * de rede na hora pra saber a URL que o Drive devolveu, então cai fora do padrão otimista dos
 * outros campos — se estiver offline, falha na hora com uma mensagem clara em vez de fingir que
 * deu certo.
 */

/**
 * Escadinha de compressão: cada degrau é uma tentativa de deixar a foto abaixo de ALVO_BASE64.
 *
 * Por que menor que antes (era 1600px/0.82 fixo): medido contra a produção real em 2026-09-03,
 * a rota /foto leva de 10s a 80s pro MESMO trabalho — a variação vem do lado do Google (a mesma
 * chamada ao Apps Script oscila entre 3s e 60s), não do tamanho do arquivo. O tamanho é o fator
 * secundário, mas é o único que dá pra controlar daqui: uma foto de celular a 1600px/0.82 dá
 * 600 KB-1 MB de base64, e a rota encadeia três chamadas ao Apps Script, então num minuto ruim
 * isso vira os 2-3 minutos + erro que o Carlos viu. 1280px cobre a tela do detalhe e o zoom do
 * PhotoViewer num celular (390 CSS px × 3 de DPR).
 */
const DEGRAUS = [
  { maxDim: 1280, quality: 0.72 },
  { maxDim: 1280, quality: 0.6 },
  { maxDim: 1024, quality: 0.6 },
  { maxDim: 800, quality: 0.55 },
] as const;

/** ~250 KB de base64 (~185 KB de JPEG) — foto de celular típica cabe no primeiro ou segundo
 *  degrau, sem perda visível na tela do detalhe. */
const ALVO_BASE64 = 250_000;

/** Rede de segurança: sem isso o "Enviando..." fica indefinidamente na tela se a requisição
 *  travar (foi o que aconteceu: 2-3 minutos parados até um erro genérico). */
const TIMEOUT_MS = 180_000;

export interface UploadPhotoResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem"));
    img.src = dataUrl;
  });
}

/** Um degrau da escadinha: redimensiona e recomprime em JPEG, devolvendo só o base64. */
function encodeJpegBase64(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale) || 1;
  const h = Math.round(img.height * scale) || 1;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, 0, 0, w, h);

  const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
  const comma = jpegDataUrl.indexOf(",");
  return comma === -1 ? jpegDataUrl : jpegDataUrl.slice(comma + 1);
}

/** Recomprime até ficar abaixo de ALVO_BASE64 (ou até acabarem os degraus) — roda no navegador,
 *  nunca manda o arquivo original de câmera (podem ser 5-10 MB) pro servidor. */
async function compressToJpegBase64(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let base64 = "";
  for (const degrau of DEGRAUS) {
    base64 = encodeJpegBase64(img, degrau.maxDim, degrau.quality);
    if (base64.length <= ALVO_BASE64) break;
  }
  return base64;
}

/** Sobe a foto de um item já existente (não dá pra anexar foto num item ainda não salvo — o
 *  upload precisa de um id de linha real pra gravar img_url/img_nome). Atualiza o cache local na
 *  volta (`applyServerPatch`) pra a lista/detalhe mostrarem a foto nova sem esperar sync. */
export async function uploadItemPhoto(type: ItemType, id: string, file: File): Promise<UploadPhotoResult> {
  if (!navigator.onLine) return { ok: false, error: "Sem conexão — tente novamente online." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Escolha um arquivo de imagem." };

  let base64Data: string;
  try {
    base64Data = await compressToJpegBase64(file);
  } catch {
    return { ok: false, error: "Não foi possível processar essa imagem." };
  }

  const tab = TYPE_TAB[type] as ItemTab;
  const filename = `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`;

  try {
    const res = await fetch(`/api/items/${tab}/${id}/foto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, mimeType: "image/jpeg", filename }),
      // `in` porque WebView antigo pode não ter AbortSignal.timeout - sem ele o upload segue
      // como antes (sem limite), em vez de a chamada explodir com TypeError.
      signal: "timeout" in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Erro ao enviar a foto." };
    }
    const { url, imgNome } = (await res.json()) as { url: string; imgNome: string };
    await applyServerPatch(tab, id, {
      [IMG_URL_COL[type]]: url,
      [SCHEMA[type].imgNomeCol]: imgNome,
      updated_at: new Date().toISOString(),
    });
    return { ok: true, url };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ok: false, error: "A foto demorou demais pra subir. Tente de novo." };
    }
    return { ok: false, error: "Erro de rede ao enviar a foto." };
  }
}
