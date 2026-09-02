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

const MAX_DIMENSION = 1600; // px, no maior lado — suficiente pra tela do detalhe, evita fotos de câmera de 10+ MB
const JPEG_QUALITY = 0.82;

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

/** Redimensiona (maior lado ≤ MAX_DIMENSION) e recomprime em JPEG via <canvas> — roda no
 *  navegador, nunca manda o arquivo original de câmera (podem ser 5-10 MB) pro servidor. */
async function compressToJpegBase64(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale) || 1;
  const h = Math.round(img.height * scale) || 1;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, 0, 0, w, h);

  const jpegDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const comma = jpegDataUrl.indexOf(",");
  return comma === -1 ? jpegDataUrl : jpegDataUrl.slice(comma + 1);
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
  } catch {
    return { ok: false, error: "Erro de rede ao enviar a foto." };
  }
}
