/**
 * Selo de versão, mostrado no rodapé do Perfil.
 *
 * Pedido do Carlos em 2026-09-04, no meio da caçada ao upload de foto: sem isto não havia como
 * ele ter certeza de que o aparelho estava rodando a versão que eu tinha acabado de subir. Nas
 * primeiras rodadas do bug chegamos a suspeitar de cache do PWA justamente por essa dúvida, e
 * gastamos uma rodada inteira nela.
 *
 * São dois números de propósito:
 * - `BUILD_NUMERO`: sequencial legível, o que dá pra comparar em voz alta ("subi a 3, aí mostra
 *   qual?"). Incrementado à mão a cada deploy que vale conferir.
 * - `BUILD_SHA`: o commit de verdade, injetado pelo Vercel no build. É a prova - o sequencial
 *   depende de eu lembrar de incrementar, o SHA não depende de mim.
 */

/** Incremente ao subir uma versão que o Carlos vai conferir. */
export const BUILD_NUMERO = 3;

/** Commit publicado. `VERCEL_GIT_COMMIT_SHA` é preenchido pelo Vercel; em dev não existe. */
export const BUILD_SHA = (process.env.NEXT_PUBLIC_BUILD_SHA ?? "").slice(0, 7) || "local";

/** Momento do build, em ISO. Vira "04/09 16:32" na tela. */
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

/** "v3 · 0cdd48f · 04/09 16:32" - a linha que aparece no rodapé do Perfil. */
export function buildLabel(): string {
  const partes = [`v${BUILD_NUMERO}`, BUILD_SHA];
  if (BUILD_TIME) {
    const d = new Date(BUILD_TIME);
    if (!Number.isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, "0");
      partes.push(`${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`);
    }
  }
  return partes.join(" · ");
}
