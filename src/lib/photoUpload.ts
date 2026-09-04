import { IMG_URL_COL, TYPE_TAB, type ItemType } from "@/lib/catalog";
import { applyServerPatch, type ItemTab } from "@/lib/offline/sync";
import { SCHEMA } from "@/lib/itemSchema";
import { clearLocalPreview } from "@/lib/localPhotoPreview";
import {
  blobToBase64,
  closeDrawable,
  decodeImage,
  descreveErro,
  drawableSize,
  encodeJpeg,
  lerBytes,
  sniffFormat,
  type LeituraArquivo,
  type Assinatura,
} from "@/lib/imageDecode";

/**
 * Foto de item: preparar (local, ao escolher) e enviar (rede, ao salvar).
 *
 * Redesenho de 2026-09-04, depois de o upload falhar SÓ no celular do Carlos por três rodadas
 * seguidas ("Não foi possível processar essa imagem.", sempre passando no desktop). O que mudou
 * de verdade não foi o algoritmo de compressão e sim QUANDO ele roda:
 *
 * - Antes: escolher a foto guardava o `File` cru e mostrava um preview `blob:` dele; a compressão
 *   só acontecia lá na frente, dentro do upload disparado pelo Salvar. Preview e upload passavam
 *   por decodificadores DIFERENTES (o `<img>` do preview, o canvas do upload), então podiam
 *   discordar - e discordavam. Pior: a falha aparecia depois do Salvar, num toast, com o usuário
 *   já de volta na lista e sem nada a fazer a respeito.
 * - Agora: `preparePhoto` roda na hora da escolha e produz o JPEG final. O preview é ESSE JPEG.
 *   Se a foto aparece na tela, ela vai subir - é o mesmo arquivo, já pronto, esperando só a rede.
 *   E quando não dá pra processar, o erro é imediato, com a tela aberta e o usuário podendo
 *   escolher outra foto.
 *
 * O que não mudou (pedido do Carlos em 2026-09-03, seção 8.2): escolher a foto não sobe nada. A
 * preparação é 100% local; o envio continua começando só no Salvar, em segundo plano, sem a tela
 * esperar por ele.
 */

/**
 * Escadinha de compressão: o primeiro degrau que couber em ALVO_BASE64 vence.
 *
 * O teto existe por latência, não por banda: medido contra a produção em 2026-09-03, a rota /foto
 * leva de 10s a 80s pro mesmo trabalho (a oscilação vem do Apps Script, ver seção 8.1), e o
 * tamanho é o único fator que dá pra controlar daqui. 1600px é o topo porque é o que o
 * PhotoViewer usa pra dar zoom.
 */
const DEGRAUS = [
  { maxDim: 1600, quality: 0.78 },
  { maxDim: 1600, quality: 0.62 },
  { maxDim: 1280, quality: 0.68 },
  { maxDim: 1280, quality: 0.55 },
  { maxDim: 1024, quality: 0.55 },
] as const;

/** ~300 KB de JPEG. Escolha do Carlos em 2026-09-03 (500 KB levaram 12,6s; 700 KB, 25,8s). */
const ALVO_BASE64 = 400_000;

/** Teto do envio do arquivo original, quando a recompressão falha mas o arquivo já é pequeno.
 *  Fica bem abaixo do limite de 6.000.000 da rota (`/api/items/[tipo]/[id]/foto`). */
const MAX_BASE64_CRU = 3_000_000;

/** Formatos que o `<img>` renderiza em qualquer navegador - os únicos que vale enviar sem
 *  recomprimir, já que uma foto que o app não consegue exibir depois não serve de nada. */
const TIPOS_RENDERIZAVEIS = ["image/jpeg", "image/png", "image/webp"];

/** Rede de segurança do POST: sem isto o envio pode ficar pendurado indefinidamente. */
const TIMEOUT_MS = 180_000;

/**
 * Laudo da última preparação de foto. Existe porque não há como depurar o celular do Carlos daqui
 * (Browser pane é proibida neste projeto) e "Não foi possível processar essa imagem." não diz
 * nada: agora a tela consegue mostrar em que etapa parou e por quê.
 */
export interface PhotoDiagnostics {
  arquivo: string;
  tipo: string;
  tamanhoKb: number;
  navegador: string;
  /** O que os BYTES dizem que o arquivo é, mais os primeiros deles em hex. Vale mais que o nome
   *  e o MIME, que vêm do provider do Android e já se provaram mentirosos. */
  assinatura?: string;
  etapas: string[];
  erro?: string;
}

export interface PreparedPhoto {
  /** JPEG final, pronto pra subir - é também a origem do preview. */
  base64: string;
  mimeType: string;
  filename: string;
  /** Object URL do blob preparado. Quem recebe é responsável por revogar. */
  previewUrl: string;
  larguraKb: number;
  diagnostics: PhotoDiagnostics;
}

export type PreparePhotoResult =
  | { ok: true; photo: PreparedPhoto }
  | { ok: false; error: string; diagnostics: PhotoDiagnostics };

function capacidadesDoNavegador(): string {
  const tem = (nome: string, existe: boolean) => `${nome}=${existe ? "sim" : "não"}`;
  return [
    tem("createImageBitmap", typeof createImageBitmap === "function"),
    tem("OffscreenCanvas", typeof OffscreenCanvas === "function"),
    tem("toBlob", typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.toBlob === "function"),
  ].join(" · ");
}

function trocaExtensao(nome: string, ext: string): string {
  const base = nome.replace(/\.[^.]+$/, "").trim();
  return `${base || "foto"}.${ext}`;
}

/**
 * Transforma o arquivo escolhido no JPEG que vai subir. Roda inteiramente no navegador, sem tocar
 * na rede - pode ser chamada no instante da escolha, que é justamente o ponto.
 *
 * Nunca lança: devolve `{ ok: false }` com uma mensagem pro usuário e o laudo pra diagnóstico.
 */
export async function preparePhoto(
  file: File,
  /**
   * Leitura JÁ INICIADA pelo chamador, no mesmo tick do evento de seleção.
   *
   * No Android a permissão do `content://` que respalda o `File` pode acabar quando o handler do
   * evento devolve o controle - e todo `await` antes da primeira leitura devolve o controle. Por
   * isso `onPhotoSelected` dispara `lerBytes` na primeira linha, sem esperar, e passa a promessa
   * pra cá em vez de deixar esta função ler por conta própria mais tarde.
   */
  leituraIniciada?: Promise<LeituraArquivo>,
): Promise<PreparePhotoResult> {
  const etapas: string[] = [];
  const diagnostics: PhotoDiagnostics = {
    arquivo: file.name || "(sem nome)",
    tipo: file.type || "(desconhecido)",
    tamanhoKb: Math.round(file.size / 1024),
    navegador: capacidadesDoNavegador(),
    etapas,
  };
  const registrar = (linha: string) => etapas.push(linha);

  if (file.type && !file.type.startsWith("image/")) {
    diagnostics.erro = `tipo ${file.type} não é imagem`;
    return { ok: false, error: "Esse arquivo não é uma imagem.", diagnostics };
  }

  // Ler os bytes é a PRIMEIRA coisa, por todos os caminhos disponíveis (ver `lerBytes`): no
  // celular do Carlos o `File` do seletor chega com nome e tamanho certos e conteúdo inacessível,
  // e qual API consegue lê-lo varia por navegador e por origem do arquivo.
  const leitura = await (leituraIniciada ?? lerBytes(file));
  for (const t of leitura.tentativas) registrar(`leitura ${t}`);

  if (!leitura.bytes) {
    diagnostics.assinatura = "não foi possível ler os bytes";
    diagnostics.erro = "nenhum método de leitura devolveu conteúdo";
    return {
      ok: false,
      error:
        "O arquivo chegou vazio: vieram o nome e o tamanho, mas nenhum byte. Toque em Escolher outra e selecione a foto pelo app de Arquivos (ou baixe pro aparelho, se ela estiver só no Google Fotos).",
      diagnostics,
    };
  }
  registrar(`leitura: ${leitura.metodo} venceu`);

  // Assinatura pelos BYTES: nome e MIME vêm do provider do Android e podem mentir - o laudo de
  // 2026-09-04 trouxe um `.jpg` declarado `image/jpeg` que nenhum decodificador abriu.
  const assinatura = sniffFormat(leitura.bytes);
  diagnostics.assinatura = `${assinatura.formato} · bytes: ${assinatura.hex}`;
  registrar(`assinatura: ${assinatura.formato}`);

  // Daqui pra frente trabalha-se sobre um Blob construído a partir dos bytes já em memória, nunca
  // sobre o `File` original: ele não tem nenhum vínculo com o `content://` do Android, então some
  // junto a classe inteira de falha que motivou tudo isto.
  const fonte = new Blob([leitura.bytes], { type: assinatura.formato === "JPEG" ? "image/jpeg" : file.type || "image/jpeg" });
  const head = { bytes: leitura.bytes };

  let img;
  try {
    img = await decodeImage(fonte, head, DEGRAUS[0].maxDim, registrar);
  } catch (err) {
    registrar(`decode: todos os caminhos falharam (${descreveErro(err)})`);
    return falhaDeDecodificacao(file, fonte, assinatura, diagnostics, registrar);
  }

  try {
    const { width, height } = drawableSize(img);
    registrar(`origem: ${width}x${height}`);

    let melhor: { blob: Blob; degrau: (typeof DEGRAUS)[number] } | null = null;
    let ultimoErro = "";
    for (const degrau of DEGRAUS) {
      try {
        const blob = await encodeJpeg(img, degrau.maxDim, degrau.quality);
        const base64Len = Math.ceil(blob.size / 3) * 4;
        registrar(`encode ${degrau.maxDim}px q${degrau.quality}: ${Math.round(blob.size / 1024)} KB`);
        melhor = { blob, degrau };
        if (base64Len <= ALVO_BASE64) break;
      } catch (err) {
        // Um degrau falhando (memória, quase sempre) não derruba os menores ainda não tentados -
        // era o que a versão anterior fazia, desistindo com tamanhos mais leves por tentar.
        ultimoErro = descreveErro(err);
        registrar(`encode ${degrau.maxDim}px q${degrau.quality}: falhou (${ultimoErro})`);
      }
    }

    if (!melhor) {
      registrar("encode: nenhum degrau funcionou");
      diagnostics.erro = ultimoErro || "nenhum degrau de compressão funcionou";
      return enviarCruOuFalhar(file, fonte, diagnostics, registrar, "Não foi possível reduzir essa foto.");
    }

    const base64 = await blobToBase64(melhor.blob);
    registrar(`base64: ${Math.round(base64.length / 1024)} KB`);
    return {
      ok: true,
      photo: {
        base64,
        mimeType: "image/jpeg",
        filename: trocaExtensao(file.name, "jpg"),
        previewUrl: URL.createObjectURL(melhor.blob),
        larguraKb: Math.round(melhor.blob.size / 1024),
        diagnostics,
      },
    };
  } catch (err) {
    registrar(`preparação: erro inesperado (${descreveErro(err)})`);
    diagnostics.erro = descreveErro(err);
    return enviarCruOuFalhar(file, fonte, diagnostics, registrar, "Não foi possível processar essa foto.");
  } finally {
    closeDrawable(img);
  }
}

/**
 * Nenhum decodificador do navegador leu o arquivo. A mensagem sai da ASSINATURA, não da extensão:
 * o caso que motivou isto era um arquivo `.jpg`, anunciado como `image/jpeg`, cujo conteúdo não
 * era JPEG nenhum. Dizer "não foi possível abrir" quando dá pra dizer "isto é HEIF, converta
 * assim" é a diferença entre o Carlos resolver sozinho e abrir mais uma rodada comigo.
 */
async function falhaDeDecodificacao(
  file: File,
  fonte: Blob,
  assinatura: Assinatura,
  diagnostics: PhotoDiagnostics,
  registrar: (l: string) => void,
): Promise<PreparePhotoResult> {
  diagnostics.erro = `nenhum decodificador leu o arquivo (assinatura: ${assinatura.formato})`;

  if (assinatura.formato === "HEIF/HEIC" || assinatura.formato === "AVIF") {
    return {
      ok: false,
      error: `Essa foto está em ${assinatura.formato} (mesmo com nome .jpg), formato que o navegador não abre. Jeito mais rápido: abra a foto na Galeria, toque em Editar e salve uma cópia - ela sai em JPEG. Pra não repetir, desligue o formato de alta eficiência nas configurações da câmera.`,
      diagnostics,
    };
  }

  if (assinatura.formato === "TIFF/RAW") {
    return {
      ok: false,
      error: "Essa foto está em RAW/TIFF, que o navegador não abre. Salve uma cópia em JPEG pela Galeria e anexe ela.",
      diagnostics,
    };
  }

  if (assinatura.formato === "JPEG") {
    // Assinatura certa e mesmo assim ninguém decodificou: arquivo truncado ou corrompido.
    return {
      ok: false,
      error: "Esse JPEG parece estar corrompido ou incompleto - o navegador não conseguiu abrir. Tente outra foto.",
      diagnostics,
    };
  }

  registrar(`formato não reconhecido pelos bytes (${assinatura.hex})`);
  return enviarCruOuFalhar(file, fonte, diagnostics, registrar, "Não foi possível abrir essa imagem.");
}

/**
 * Último recurso: mandar o arquivo como está. Só vale a pena quando ele já é pequeno e de um
 * formato que o app consegue exibir depois - subir algo que nunca vai renderizar é pior que
 * recusar. Melhor uma foto maior no Drive do que um cadastro sem foto nenhuma.
 */
async function enviarCruOuFalhar(
  file: File,
  fonte: Blob,
  diagnostics: PhotoDiagnostics,
  registrar: (l: string) => void,
  mensagemDeFalha: string,
): Promise<PreparePhotoResult> {
  // `fonte` são os bytes já lidos, não o `File` do seletor: no celular do Carlos ele pode não ter
  // conteúdo acessível nenhum (ver lerBytes), então enviá-lo mandaria um arquivo vazio pro Drive.
  const base64Estimado = Math.ceil(fonte.size / 3) * 4;
  if (!TIPOS_RENDERIZAVEIS.includes(fonte.type) || base64Estimado > MAX_BASE64_CRU) {
    registrar(`cru: descartado (tipo ${fonte.type || "?"}, ~${Math.round(base64Estimado / 1024)} KB de base64)`);
    return { ok: false, error: mensagemDeFalha, diagnostics };
  }
  try {
    const base64 = await blobToBase64(fonte);
    registrar(`cru: enviando o arquivo original (${Math.round(base64.length / 1024)} KB de base64)`);
    return {
      ok: true,
      photo: {
        base64,
        mimeType: fonte.type,
        filename: file.name || "foto",
        previewUrl: URL.createObjectURL(fonte),
        larguraKb: Math.round(fonte.size / 1024),
        diagnostics,
      },
    };
  } catch (err) {
    registrar(`cru: falhou também (${descreveErro(err)})`);
    return { ok: false, error: mensagemDeFalha, diagnostics };
  }
}

// ---------- Envio ----------

export interface UploadPhotoResult {
  ok: boolean;
  url?: string;
  error?: string;
  diagnostics?: PhotoDiagnostics;
}

/**
 * Manda pro servidor uma foto JÁ preparada e grava o link nas colunas de imagem (ver `Codigo.gs`,
 * `itemFotoUpload`). Não processa imagem nenhuma: a essa altura é só rede.
 *
 * Atualiza o cache local na volta (`applyServerPatch`) pra a lista e o detalhe mostrarem a foto
 * mesmo se a tela que pediu o envio já tiver fechado.
 */
export async function uploadPreparedPhoto(
  type: ItemType,
  id: string,
  photo: PreparedPhoto,
): Promise<UploadPhotoResult> {
  if (!navigator.onLine) {
    return { ok: false, error: "Sem conexão - a foto não foi enviada.", diagnostics: photo.diagnostics };
  }

  const tab = TYPE_TAB[type] as ItemTab;
  try {
    const res = await fetch(`/api/items/${tab}/${id}/foto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64Data: photo.base64,
        mimeType: photo.mimeType,
        filename: photo.filename,
      }),
      // `in` porque WebView antigo pode não ter AbortSignal.timeout - sem ele o envio segue sem
      // limite, em vez de a chamada explodir com TypeError.
      signal: "timeout" in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: body.error ?? `Erro ao enviar a foto (HTTP ${res.status}).`,
        diagnostics: photo.diagnostics,
      };
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
      return { ok: false, error: "A foto demorou demais pra subir. Tente de novo.", diagnostics: photo.diagnostics };
    }
    return { ok: false, error: `Erro de rede ao enviar a foto (${descreveErro(err)}).`, diagnostics: photo.diagnostics };
  }
}

// ---------- Fila de envio em segundo plano ----------

export interface PhotoUploadEventDetail {
  type: ItemType;
  id: string;
  result: UploadPhotoResult;
}

/** Emite "done" quando um envio em segundo plano termina - é como uma tela que já fechou (voltou
 *  pra lista antes do envio acabar) ainda avisa o usuário. Ver `GlobalPhotoToast`. */
export const photoUploadEvents = new EventTarget();

/** Envios em andamento, por `${type}:${id}` - permite reabrir o MESMO item e ver "Enviando…" em
 *  vez da foto velha, e impede dois envios paralelos pro mesmo item. */
const emCurso = new Map<string, Promise<UploadPhotoResult>>();

function chave(type: ItemType, id: string): string {
  return `${type}:${id}`;
}

export function getPendingPhotoUpload(type: ItemType, id: string): Promise<UploadPhotoResult> | undefined {
  return emCurso.get(chave(type, id));
}

/**
 * Dispara o envio e NÃO espera terminar - quem chama segue em frente (`DetailScreen.save()` fecha
 * a tela na hora). O resultado chega pelo `photoUploadEvents` e, dando certo, direto no cache
 * local, sem precisar de nenhuma tela aberta.
 */
export function queuePhotoUpload(type: ItemType, id: string, photo: PreparedPhoto): void {
  const k = chave(type, id);
  const tarefa = uploadPreparedPhoto(type, id, photo);
  emCurso.set(k, tarefa);
  void tarefa
    .then((result) => {
      photoUploadEvents.dispatchEvent(
        new CustomEvent<PhotoUploadEventDetail>("done", { detail: { type, id, result } }),
      );
      // Termina o papel do preview local da lista (ver localPhotoPreview.ts): dando certo, a
      // coluna *_img_url real já está no cache (`applyServerPatch`, dentro de uploadPreparedPhoto)
      // e a lista já pode usar ela; falhando, não faz sentido segurar um preview de uma foto que
      // não subiu.
      clearLocalPreview(TYPE_TAB[type] as ItemTab, id);
    })
    .finally(() => {
      if (emCurso.get(k) === tarefa) emCurso.delete(k);
    });
}

/** Laudo em texto, pro botão "Detalhes" do erro - é isto que o Carlos me manda por print quando
 *  algo falhar num aparelho que eu não tenho como inspecionar. */
export function formatDiagnostics(d: PhotoDiagnostics): string {
  return [
    `arquivo: ${d.arquivo}`,
    `tipo: ${d.tipo} · ${d.tamanhoKb} KB`,
    d.assinatura ? `assinatura: ${d.assinatura}` : "",
    `navegador: ${d.navegador}`,
    ...d.etapas.map((e) => `· ${e}`),
    d.erro ? `erro: ${d.erro}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
