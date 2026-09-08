import "server-only";

/**
 * Leitura de rótulo de cerveja (foto) via Gemini API (Google AI Studio, free tier) - só do
 * servidor, a `GEMINI_API_KEY` nunca chega ao cliente (mesmo padrão do `APPS_SCRIPT_SHARED_SECRET`).
 * `fetch` direto na REST API, sem SDK novo como dependência. Portado do `gemini.ts` do TravelTrack
 * (que faz o mesmo pra vouchers de viagem), com prompt/schema próprios pra cerveja.
 *
 * Modelo: `gemini-3.5-flash-lite`. Testado contra a chave real do Carlos no TravelTrack em
 * 2026-08-25 - a geração 2.x parou de aceitar chave nova, e entre os que respondem o Lite tem
 * 500 req/dia no free tier (25x o "Flash cheio"). O schema com todo campo "required" (só força a
 * CHAVE a aparecer, não obriga valor) foi o que fez o Lite extrair tão bem quanto o Flash cheio.
 */

const MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = `Você recebe a FOTO DO RÓTULO de uma cerveja (lata, garrafa ou growler). Extraia os
campos abaixo lendo o que está escrito no rótulo e devolva SÓ o JSON pedido pelo schema. Regras:

- NUNCA invente um valor que não está no rótulo. Se não encontrar, devolva string vazia "".
- Todo campo do schema precisa estar presente na resposta (mesmo que "").

Campos:
- nome: o nome comercial da cerveja (ex.: "Petroleum", "Puro Malte", "Appia"). Só o nome do
  produto - NÃO junte o nome da cervejaria (o app junta depois).
- cervejaria: nome da cervejaria/fabricante como escrito no rótulo (ex.: "Antuérpia", "Cervejaria
  Colorado", "Bodebrown").
- pais: país de origem da cervejaria, por extenso em PORTUGUÊS (ex.: "Brasil", "Estados Unidos",
  "Bélgica"). Se não tiver certeza, deixe "".
- estilo: o estilo da cerveja como aparece no rótulo, texto livre (ex.: "American IPA", "Weiss",
  "Imperial Stout", "Witbier", "Pilsen", "Puro Malte"). Copie o que está escrito.
- estilo_bjcp: só se o rótulo trouxer explicitamente um CÓDIGO BJCP (ex.: "21A", "13C"). Senão "".
- abv: teor alcoólico. PROCURE COM ATENÇÃO - quase todo rótulo tem, em algum destes formatos:
  "ABV 5,2%", "Álc. 5,2% Vol.", "5.2% ALC/VOL", "TEOR ALCOÓLICO 5,2%", "GL 5,2", "5,2°",
  "álcool 5,2% em volume". Devolva SÓ o número, com PONTO decimal (ex.: "5.2", "8"), sem "%".
  Se o rótulo usar vírgula ("5,2"), converta pra ponto ("5.2").
- ibu: amargor IBU, só o número inteiro (ex.: "45"). "" se não aparecer.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    nome: { type: "STRING" },
    cervejaria: { type: "STRING" },
    pais: { type: "STRING" },
    estilo: { type: "STRING" },
    estilo_bjcp: { type: "STRING" },
    abv: { type: "STRING" },
    ibu: { type: "STRING" },
  },
  required: ["nome", "cervejaria", "pais", "estilo", "estilo_bjcp", "abv", "ibu"],
};

export interface RotuloExtraido {
  nome: string;
  cervejaria: string;
  pais: string;
  estilo: string;
  estilo_bjcp: string;
  abv: string;
  ibu: string;
}

const CAMPOS: (keyof RotuloExtraido)[] = [
  "nome",
  "cervejaria",
  "pais",
  "estilo",
  "estilo_bjcp",
  "abv",
  "ibu",
];

/** Nunca confia cegamente na API: todo campo vira string, número solto no `abv`/`ibu` (o modelo
 *  às vezes manda number apesar do schema) vira texto. */
function normalizar(bruto: unknown): RotuloExtraido {
  const obj = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const out = {} as RotuloExtraido;
  for (const campo of CAMPOS) {
    const v = obj[campo];
    out[campo] = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  }
  return out;
}

export class GeminiIndisponivelError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Manda a foto do rótulo (base64) pro Gemini e devolve os campos lidos. Lança
 * `GeminiIndisponivelError` em qualquer falha (sem chave, rede, cota, resposta estranha) - o
 * chamador trata como "não deu pra ler automaticamente", nunca fatal: o cadastro manual segue.
 *
 * Uma retentativa em 503 ("high demand" - pico temporário do lado do Google, visto no teste de
 * 2026-09-08 e recuperou sozinho no retry). Não repete em 4xx (chave/cota são problema de config,
 * não transitório).
 */
export async function analisarRotulo(base64Data: string, mimeType: string): Promise<RotuloExtraido> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiIndisponivelError("GEMINI_API_KEY não configurada");

  const corpo = JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  let res: Response | undefined;
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
        signal: "timeout" in AbortSignal ? AbortSignal.timeout(30_000) : undefined,
      });
    } catch {
      throw new GeminiIndisponivelError("Falha de rede ao chamar o Gemini");
    }
    if (res.status === 503 && tentativa === 1) {
      await sleep(1500);
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    const texto = res ? await res.text().catch(() => "") : "";
    throw new GeminiIndisponivelError(`Gemini respondeu ${res?.status ?? "?"}: ${texto.slice(0, 200)}`);
  }

  const json = await res.json();
  const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof texto !== "string") {
    throw new GeminiIndisponivelError("Resposta do Gemini sem conteúdo de texto");
  }

  try {
    return normalizar(JSON.parse(texto));
  } catch {
    throw new GeminiIndisponivelError("Resposta do Gemini não é um JSON válido");
  }
}
