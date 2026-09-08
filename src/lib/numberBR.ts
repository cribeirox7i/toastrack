/**
 * Números decimais (nota, ABV) são gravados na planilha em notação BR - vírgula como separador
 * decimal (pedido do Carlos 2026-09-08: a planilha é editada à mão em pt-BR, "5.2" ali fica
 * estranho e o Sheets às vezes trata como texto).
 *
 * O código continua trabalhando com ponto/`Number` internamente; a conversão acontece só nas
 * bordas: ao gravar (`toStoredBR`), ao carregar no formulário (`toFormBR` - `<input type="number">`
 * SÓ aceita ponto), ao exibir na tela de detalhe (`toDisplayBR`) e ao ler pra cálculo/ordenação
 * (`parseNumBR`).
 *
 * Os dados existentes são MISTOS (import antigo com ponto, linhas novas já com vírgula - visto no
 * `read` da aba beer): `parseNumBR` aceita os dois, então nada precisa ser migrado.
 */

/** Texto da planilha (ponto OU vírgula) -> number. NaN se não for número - quem chama faz `|| 0`. */
export function parseNumBR(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? NaN : Number(s);
}

/** Valor do formulário (sempre com ponto ou vazio) -> como grava na planilha (vírgula). Inteiro
 *  fica igual ("40" -> "40"). */
export function toStoredBR(s: string): string {
  return (s ?? "").trim().replace(".", ",");
}

/** Valor da planilha (pode ter vírgula) -> valor pro `<input type="number">` (só ponto). */
export function toFormBR(s: string): string {
  return (s ?? "").trim().replace(",", ".");
}

/** Valor pro texto da tela de detalhe em pt-BR (vírgula). */
export function toDisplayBR(s: string): string {
  return (s ?? "").trim().replace(".", ",");
}

/** number -> texto pt-BR com N casas decimais fixas (ex.: 4.5 -> "4,5"). Pra nota/média exibidas. */
export function fmtDecimalBR(n: number, casas = 1): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
