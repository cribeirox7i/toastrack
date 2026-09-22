import { preparePhoto } from "@/lib/photoUpload";

/**
 * Cliente do "ler rótulo" (pedido do Carlos 2026-09-07: cadastro automático pela foto do rótulo,
 * via Gemini, mesma API que o TravelTrack usa pra voucher; estendido a vinho em 2026-09-22).
 * Comprime a foto no navegador (a mesma `preparePhoto` do upload de foto de item) e manda pra
 * `/api/items/analisar-rotulo`.
 *
 * Nunca lança - devolve `{ ok: false, error }`. O cadastro manual segue funcionando sem isto.
 */

export type TipoRotulo = "beer" | "wine";

export interface RotuloExtraidoBeer {
  nome: string;
  cervejaria: string;
  pais: string;
  estilo: string;
  estilo_bjcp: string;
  abv: string;
  ibu: string;
}

export interface RotuloExtraidoWine {
  nome: string;
  produtor: string;
  pais: string;
  uva: string;
  regiao: string;
  cor: string;
  tipo: string;
  safra: string;
  abv: string;
}

type ScanResult<T> = { ok: true; campos: T } | { ok: false; error: string };

export async function scanLabel(file: File, tipo: "beer"): Promise<ScanResult<RotuloExtraidoBeer>>;
export async function scanLabel(file: File, tipo: "wine"): Promise<ScanResult<RotuloExtraidoWine>>;
export async function scanLabel(
  file: File,
  tipo: TipoRotulo,
): Promise<ScanResult<RotuloExtraidoBeer> | ScanResult<RotuloExtraidoWine>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "Sem conexão — não deu pra ler o rótulo." };
  }
  const prep = await preparePhoto(file);
  if (!prep.ok) return { ok: false, error: prep.error };
  return tipo === "beer"
    ? scanLabelBase64(prep.photo.base64, prep.photo.mimeType, "beer")
    : scanLabelBase64(prep.photo.base64, prep.photo.mimeType, "wine");
}

/** Quando a foto JÁ foi preparada (o cadastro de item comprime a foto na escolha) - evita
 *  recomprimir. */
export async function scanLabelBase64(base64Data: string, mimeType: string, tipo: "beer"): Promise<ScanResult<RotuloExtraidoBeer>>;
export async function scanLabelBase64(base64Data: string, mimeType: string, tipo: "wine"): Promise<ScanResult<RotuloExtraidoWine>>;
export async function scanLabelBase64(
  base64Data: string,
  mimeType: string,
  tipo: TipoRotulo,
): Promise<ScanResult<RotuloExtraidoBeer> | ScanResult<RotuloExtraidoWine>> {
  try {
    const res = await fetch("/api/items/analisar-rotulo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, mimeType, tipo }),
      signal: "timeout" in AbortSignal ? AbortSignal.timeout(45_000) : undefined,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Não deu pra ler o rótulo." };
    }
    const campos = (await res.json()) as RotuloExtraidoBeer | RotuloExtraidoWine;
    return { ok: true, campos } as ScanResult<RotuloExtraidoBeer> | ScanResult<RotuloExtraidoWine>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ok: false, error: "A leitura do rótulo demorou demais. Tente de novo." };
    }
    return { ok: false, error: "Erro de rede ao ler o rótulo." };
  }
}
