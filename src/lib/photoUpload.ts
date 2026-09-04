import { IMG_URL_COL, TYPE_TAB, type ItemType } from "@/lib/catalog";
import { applyServerPatch, type ItemTab } from "@/lib/offline/sync";
import { SCHEMA } from "@/lib/itemSchema";

/**
 * Upload de foto de item (etapa "fora de escopo" da migração original — ver MIGRACAO_SHEETS.md
 * seção 7, etapa 6: img_url/img_nome sempre existiram na planilha, nenhuma tela subia foto nova).
 *
 * Redesenhado 2026-09-03 (pedido do Carlos): a foto NUNCA sobe na hora de escolher — só quando o
 * item é salvo, e mesmo aí em segundo plano (`queuePhotoUpload`), sem travar a tela nem esperar a
 * rede pra voltar pra lista. Isso também é o que elimina a necessidade de desfazer no Cancelar:
 * como nada sobe antes do Salvar, cancelar é só descartar o arquivo escolhido localmente — nunca
 * chega a existir uma foto órfã no servidor pra reverter.
 */

/**
 * Escadinha de compressão: cada degrau é uma tentativa de deixar a foto abaixo de ALVO_BASE64.
 *
 * Por que existe um teto (antes era 1600px/0.82 fixo, sem teto): medido contra a produção real em
 * 2026-09-03, a rota /foto leva de 10s a 80s pro MESMO trabalho — a variação vem do lado do
 * Google (a mesma chamada ao Apps Script oscila entre 3s e 60s), não do tamanho do arquivo. O
 * tamanho é o fator secundário, mas é o único que dá pra controlar daqui: uma foto de celular a
 * 1600px/0.82 dá 600 KB-1 MB de base64. O teto (não a resolução) é o que resolve: começa em
 * 1600px, que é bom pro zoom do PhotoViewer, e só desce se não couber.
 */
const DEGRAUS = [
  { maxDim: 1600, quality: 0.78 },
  { maxDim: 1600, quality: 0.62 },
  { maxDim: 1280, quality: 0.68 },
  { maxDim: 1280, quality: 0.55 },
  { maxDim: 1024, quality: 0.55 },
] as const;

/** Teto de 400 KB de base64 (~300 KB de JPEG) — escolha do Carlos 2026-09-03, com folga sobre a
 *  medição de produção (500 KB levaram 12,6s; 700 KB, 25,8s) e sem apertar a foto à toa. */
const ALVO_BASE64 = 400_000;

/** Rede de segurança: sem isso o "Enviando..." fica indefinidamente na tela se a requisição
 *  travar (foi o que aconteceu: 2-3 minutos parados até um erro genérico). */
const TIMEOUT_MS = 180_000;

export interface UploadPhotoResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Decodifica o arquivo pra um bitmap pronto pro <canvas>, sem passar por uma string base64
 *  intermediária — `readAsDataURL` + `<img>` chegava a manter arquivo + string base64 + bitmap
 *  decodificado na memória ao mesmo tempo, o que em celular com pouca RAM e uma foto de 10+ MB
 *  bastava pra derrubar a aba silenciosamente (era o "Não foi possível processar essa imagem."
 *  reportado pelo Carlos 2026-09-03: a PRIMEIRA tentativa de compressão já falhava, e como a
 *  função antiga desistia no primeiro erro, nunca chegava a tentar um tamanho menor).
 *  `createImageBitmap` decodifica direto do Blob; WebView muito antigo pode não ter, daí o
 *  fallback via `<img>` + FileReader. */
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // decodificação nativa recusou o arquivo (formato exótico) - tenta o caminho de <img>
      // antes de desistir, alguns navegadores são mais tolerantes por aí.
    }
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem"));
    img.src = dataUrl;
  });
}

function tamanhoDe(img: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return img instanceof HTMLImageElement
    ? { width: img.naturalWidth, height: img.naturalHeight }
    : { width: img.width, height: img.height };
}

/** Um degrau da escadinha: redimensiona e recomprime em JPEG, devolvendo só o base64. Lança se o
 *  navegador recusar (canvas grande demais pra memória disponível, por exemplo) - cabe a quem
 *  chama decidir se tenta um degrau menor. */
function encodeJpegBase64(img: ImageBitmap | HTMLImageElement, maxDim: number, quality: number): string {
  const { width, height } = tamanhoDe(img);
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale) || 1;
  const h = Math.round(height * scale) || 1;

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

/**
 * Recomprime até ficar abaixo de ALVO_BASE64 — roda no navegador, nunca manda o arquivo original
 * de câmera (podem ser 5-10 MB) pro servidor. Cada degrau é tentado de forma independente: se um
 * tamanho falhar (memória, principalmente), tenta o próximo MENOR em vez de desistir de todos -
 * antes um único degrau falhando derrubava a função inteira mesmo havendo tamanhos mais leves
 * ainda não tentados.
 */
async function compressToJpegBase64(file: File): Promise<string> {
  const img = await decodeImage(file);
  try {
    let base64 = "";
    let ultimoErro: unknown;
    for (const degrau of DEGRAUS) {
      try {
        base64 = encodeJpegBase64(img, degrau.maxDim, degrau.quality);
        if (base64.length <= ALVO_BASE64) return base64;
      } catch (err) {
        ultimoErro = err;
      }
    }
    if (base64) return base64; // nenhum coube no teto, mas pelo menos um degrau funcionou
    throw ultimoErro ?? new Error("Nenhum tamanho de compressão funcionou");
  } finally {
    if (img instanceof ImageBitmap) img.close(); // libera a memória do bitmap decodificado
  }
}

/** Sobe a foto de um item já existente e grava o link + nome do arquivo nas colunas de imagem —
 *  ver Codigo.gs `itemFotoUpload`. Atualiza o cache local na volta (`applyServerPatch`) pra a
 *  lista/detalhe mostrarem a foto nova mesmo se a tela que pediu o upload já tiver fechado. */
export async function uploadItemPhoto(type: ItemType, id: string, file: File): Promise<UploadPhotoResult> {
  if (!navigator.onLine) return { ok: false, error: "Sem conexão — a foto não foi enviada." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Escolha um arquivo de imagem." };

  let base64Data: string;
  try {
    base64Data = await compressToJpegBase64(file);
  } catch (err) {
    console.error("compressToJpegBase64 falhou pros 5 degraus", err);
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

// ---------- Fila de upload em segundo plano ----------

export interface PhotoUploadEventDetail {
  type: ItemType;
  id: string;
  result: UploadPhotoResult;
}

/** Emite "done" com `PhotoUploadEventDetail` quando um upload em segundo plano termina (sucesso
 *  ou erro) - é como uma tela que já fechou (voltou pra lista antes do upload acabar) ainda
 *  consegue avisar o usuário. Ver GlobalPhotoToast em MainApp.tsx. */
export const photoUploadEvents = new EventTarget();

/** Uploads em andamento, por `${type}:${id}` - permite que reabrir o MESMO item enquanto a foto
 *  dele ainda está subindo (upload dessa mesma tela, ou de uma edição anterior) mostre "Enviando"
 *  em vez de nada, e que `queuePhotoUpload` nunca dispare duas fotos em paralelo pro mesmo item. */
const emCurso = new Map<string, Promise<UploadPhotoResult>>();

function chave(type: ItemType, id: string): string {
  return `${type}:${id}`;
}

/** Promise do upload em segundo plano deste item, se houver um rodando agora. */
export function getPendingPhotoUpload(type: ItemType, id: string): Promise<UploadPhotoResult> | undefined {
  return emCurso.get(chave(type, id));
}

/**
 * Dispara o upload de `file` pro item `id` e NÃO espera terminar - quem chama segue em frente
 * (ex.: `DetailScreen.save()` já pode fechar a tela e voltar pra lista). O resultado chega via
 * `photoUploadEvents` e, em caso de sucesso, no cache local (`applyServerPatch`, dentro de
 * `uploadItemPhoto`) - não precisa de nenhuma tela aberta pra terminar de refletir.
 */
export function queuePhotoUpload(type: ItemType, id: string, file: File): void {
  const k = chave(type, id);
  const tarefa = uploadItemPhoto(type, id, file);
  emCurso.set(k, tarefa);
  void tarefa
    .then((result) => {
      photoUploadEvents.dispatchEvent(new CustomEvent<PhotoUploadEventDetail>("done", { detail: { type, id, result } }));
    })
    .finally(() => {
      if (emCurso.get(k) === tarefa) emCurso.delete(k);
    });
}
