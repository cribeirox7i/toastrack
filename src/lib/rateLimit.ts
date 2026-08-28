/**
 * Rate limiting em memória, por instância do processo. Não é um limitador distribuído (duas
 * instâncias serverless contam separado, e o contador zera a cada cold start) — o objetivo aqui é
 * o mais simples que já quebra brute-force/credential stuffing automatizado, sem depender de
 * Redis/serviço pago (mesmo padrão do TravelTrack, `C:\Claude\TravelTrack\src\lib\rateLimit.ts`).
 * Se o app crescer, trocar por um contador compartilhado.
 */

type Janela = { inicio: number; tentativas: number };

const janelas = new Map<string, Janela>();

/** Descarta janelas já expiradas para o Map não crescer sem limite com chaves antigas. */
function limpar(agora: number, janelaMs: number) {
  for (const [chave, janela] of janelas) {
    if (agora - janela.inicio > janelaMs) janelas.delete(chave);
  }
}

/**
 * Conta uma tentativa e diz se ela deve ser recusada por excesso. Janela fixa: ao estourar o
 * limite, a chave fica bloqueada até a janela virar.
 */
export function excedeuLimite(
  chave: string,
  { limite, janelaMs }: { limite: number; janelaMs: number }
): boolean {
  const agora = Date.now();
  if (janelas.size > 500) limpar(agora, janelaMs);

  const janela = janelas.get(chave);
  if (!janela || agora - janela.inicio > janelaMs) {
    janelas.set(chave, { inicio: agora, tentativas: 1 });
    return false;
  }

  janela.tentativas += 1;
  return janela.tentativas > limite;
}

/** Zera o contador de uma chave — usado quando o login dá certo, pra não punir quem acertou. */
export function limparLimite(chave: string) {
  janelas.delete(chave);
}
