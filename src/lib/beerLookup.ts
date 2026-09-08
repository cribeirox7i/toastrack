/**
 * Normalização e busca de cervejaria contra as cervejas JÁ cadastradas (pedido do Carlos
 * 2026-09-08): ao ler um rótulo, se aquela cervejaria já existe na tabela, usar a grafia
 * canônica dela (e o país que ela usa ali) em vez do que o Gemini leu - assim "Cervejaria
 * Antuérpia", "Antuerpia", "ANTUÉRPIA" viram todas a mesma coisa no catálogo.
 */

const PALAVRAS_GENERICAS =
  /\b(cervejaria|cervejarias|cerveja|cervejas|microcervejaria|brewing|brewery|brewers|brewpub|beer|company|co|cia|ltda|epp|sa|s\/a|brasil|craft)\b/g;

/** Minúsculo, sem acento, sem pontuação, sem palavra genérica, espaços colapsados. */
export function normalizarCervejaria(nome: string): string {
  return (nome ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento (a decomposição NFD as separa)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(PALAVRAS_GENERICAS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CervejariaCanonica {
  /** Grafia mais usada na tabela pra essa cervejaria. */
  nome: string;
  /** País mais comum das cervejas dessa cervejaria na tabela (nome, não id). "" se não houver. */
  paisNome: string;
  /** Quantas cervejas da tabela bateram. */
  ocorrencias: number;
}

function maisFrequente(valores: string[]): string {
  const cont = new Map<string, number>();
  for (const v of valores) {
    const t = (v ?? "").trim();
    if (t) cont.set(t, (cont.get(t) ?? 0) + 1);
  }
  let melhor = "";
  let max = 0;
  for (const [v, n] of cont) {
    if (n > max) {
      max = n;
      melhor = v;
    }
  }
  return melhor;
}

/**
 * Acha a cervejaria canônica pra um nome lido de rótulo, olhando as cervejas existentes
 * (`manufacturer` + `country`). Casa por forma normalizada igual, ou uma contendo a outra (com
 * um piso de 4 caracteres pra não casar "ipa" com "tijuca ipa" à toa). `undefined` se nada bate -
 * aí o cadastro usa o que o Gemini leu, como antes.
 */
export function acharCervejariaCanonica(
  lido: string,
  existentes: { manufacturer: string; country: string }[],
): CervejariaCanonica | undefined {
  const alvo = normalizarCervejaria(lido);
  if (alvo.length < 3) return undefined;

  const combina = existentes.filter((b) => {
    const n = normalizarCervejaria(b.manufacturer);
    if (!n) return false;
    if (n === alvo) return true;
    if (alvo.length >= 4 && n.includes(alvo)) return true;
    if (n.length >= 4 && alvo.includes(n)) return true;
    return false;
  });
  if (!combina.length) return undefined;

  return {
    nome: maisFrequente(combina.map((b) => b.manufacturer)),
    paisNome: maisFrequente(combina.map((b) => b.country)),
    ocorrencias: combina.length,
  };
}

/**
 * Nome final da cerveja = cervejaria + o resto (nome do produto, ou o estilo se não houver nome)
 * - pedido do Carlos 2026-09-08 ("Antuérpia Puro Malte", não só "Puro Malte"). Não duplica a
 * cervejaria se o nome do produto já a contém.
 */
export function nomeCompletoCerveja(cervejaria: string, nomeProduto: string, estilo: string): string {
  const marca = (cervejaria ?? "").trim();
  const resto = ((nomeProduto ?? "").trim() || (estilo ?? "").trim()).trim();
  if (!marca) return resto;
  if (!resto) return marca;
  if (normalizarCervejaria(resto).includes(normalizarCervejaria(marca))) return resto;
  return `${marca} ${resto}`;
}
