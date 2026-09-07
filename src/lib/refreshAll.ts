import { refreshAllNow } from "@/lib/offline/sync";

const TAB_LABEL: Record<string, string> = {
  beer: "cervejas",
  wine: "vinhos",
  dest: "destilados",
  drink: "drinks",
};

/**
 * Reconciliação completa das 4 abas + mensagem pronta pra mostrar na tela. Compartilhado pelo
 * botão "Atualizar dados" da barra superior e pelo puxar-pra-baixo (ver `usePullToRefresh`) - os
 * dois fazem exatamente a mesma coisa: `refreshAllNow` compara por índice/hash, então pega
 * inclusões, edições E exclusões feitas fora do app (o delta incremental nunca traz exclusão).
 *
 * Nunca lança - erro vira texto. "rodou e nada mudou" tem que ser distinguível de "rodou e
 * falhou em silêncio" (foi o que aconteceu na 1ª versão do botão de refresh).
 */
export async function refreshAllWithMessage(): Promise<string> {
  try {
    const results = await refreshAllNow();
    const falhas = results.filter((r) => r.erro);
    if (falhas.length) {
      return `Falha em ${falhas.map((f) => TAB_LABEL[f.tab] ?? f.tab).join(", ")}: ${falhas[0].erro}`;
    }
    const soma = (campo: "linhas" | "baixadas" | "apagadas") =>
      results.reduce((s, r) => s + r[campo], 0);
    const mudou = [
      soma("baixadas") ? `${soma("baixadas")} novos/alterados` : "",
      soma("apagadas") ? `${soma("apagadas")} removidos` : "",
    ].filter(Boolean);
    return `Atualizado · ${soma("linhas")} itens${mudou.length ? ` (${mudou.join(", ")})` : " · nada mudou"}`;
  } catch (err) {
    return `Erro ao atualizar: ${err instanceof Error ? err.message : String(err)}`;
  }
}
