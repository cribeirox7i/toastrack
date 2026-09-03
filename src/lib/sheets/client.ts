import "server-only";

interface AppsScriptResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function getConfig() {
  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SHARED_SECRET;

  if (!url || !secret) {
    throw new Error(
      "Variáveis de ambiente ausentes: APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET"
    );
  }

  return { url, secret };
}

const MAX_TENTATIVAS = 3;

/**
 * Teto por tentativa. Sem isso uma execução travada do lado do Google segurava a rota até a
 * função da Vercel morrer — medido em 2026-09-03: a mesma chamada ao Apps Script varia de 3s a
 * 60s conforme o humor do Google, e a rota de foto encadeia três delas. É melhor falhar com
 * mensagem clara do que ficar 3 minutos no "Enviando...".
 */
const TIMEOUT_PADRAO_MS = 60_000;

export interface CallOpcoes {
  /** Quantas tentativas no total (1 = sem retentativa). Ver comentário de idempotência abaixo. */
  tentativas?: number;
  timeoutMs?: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chama o Apps Script publicado como Web App (ver apps-script/Codigo.gs). Roda só no servidor
 * (rotas de API do Next.js) — o SHARED_SECRET nunca pode chegar ao navegador, senão qualquer um
 * que descobrisse a URL /exec conseguiria ler/escrever a planilha inteira (mesmo raciocínio do
 * TravelTrack, ver C:\Claude\TravelTrack\src\lib\sheets\client.ts). O `import "server-only"`
 * acima faz o build falhar se este arquivo for importado por engano de um Client Component.
 *
 * Nunca cacheado pelo Next.js: cada mutação precisa refletir imediatamente.
 *
 * Reintenta automaticamente: o Web App do Apps Script às vezes devolve uma página de erro HTML do
 * próprio Google (com HTTP 200) em vez do JSON esperado, mesmo quando a ação já executou com
 * sucesso do lado do script. Por isso todas as ações em Codigo.gs (append/updateById/deleteById)
 * são feitas para serem seguras de repetir (idempotentes) antes de reintentar.
 *
 * `driveUploadFile` é a exceção: ela NÃO é idempotente (cada repetição cria um arquivo novo no
 * Drive), então quem a chama passa `{ tentativas: 1 }` — repetir ali criava cópias invisíveis da
 * mesma foto justamente no caso em que o Google respondeu errado tendo executado certo.
 */
export async function callAppsScript<T>(
  action: string,
  payload: Record<string, unknown> = {},
  opcoes: CallOpcoes = {}
): Promise<T> {
  const { url, secret } = getConfig();
  const maxTentativas = opcoes.tentativas ?? MAX_TENTATIVAS;
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, action, payload }),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`Apps Script respondeu ${res.status}`);
      }

      const texto = await res.text();
      let json: AppsScriptResponse<T>;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new Error("Apps Script devolveu uma resposta que não é JSON (erro transitório do Google)");
      }

      if (!json.ok) {
        throw new Error(json.error ?? "Erro desconhecido no Apps Script");
      }

      return json.data as T;
    } catch (err) {
      ultimoErro = err;
      if (tentativa < maxTentativas) {
        await sleep(500 * tentativa);
      }
    }
  }

  throw ultimoErro;
}
