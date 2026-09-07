import { preparePhoto } from "@/lib/photoUpload";

/**
 * Cliente do "ler rótulo" (pedido do Carlos 2026-09-07: cadastro automático pela foto do rótulo,
 * via Gemini, mesma API que o TravelTrack usa pra voucher). Comprime a foto no navegador (a mesma
 * `preparePhoto` do upload de foto de item) e manda pra `/api/items/analisar-rotulo`.
 *
 * Nunca lança - devolve `{ ok: false, error }`. O cadastro manual segue funcionando sem isto.
 */

export interface RotuloExtraido {
  nome: string;
  cervejaria: string;
  pais: string;
  estilo: string;
  estilo_bjcp: string;
  abv: string;
  ibu: string;
}

export async function scanLabel(
  file: File,
): Promise<{ ok: true; campos: RotuloExtraido } | { ok: false; error: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "Sem conexão — não deu pra ler o rótulo." };
  }
  const prep = await preparePhoto(file);
  if (!prep.ok) return { ok: false, error: prep.error };
  return scanLabelBase64(prep.photo.base64, prep.photo.mimeType);
}

/** Quando a foto JÁ foi preparada (o cadastro de item comprime a foto na escolha) - evita
 *  recomprimir. */
export async function scanLabelBase64(
  base64Data: string,
  mimeType: string,
): Promise<{ ok: true; campos: RotuloExtraido } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/items/analisar-rotulo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, mimeType }),
      signal: "timeout" in AbortSignal ? AbortSignal.timeout(45_000) : undefined,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Não deu pra ler o rótulo." };
    }
    return { ok: true, campos: (await res.json()) as RotuloExtraido };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ok: false, error: "A leitura do rótulo demorou demais. Tente de novo." };
    }
    return { ok: false, error: "Erro de rede ao ler o rótulo." };
  }
}
