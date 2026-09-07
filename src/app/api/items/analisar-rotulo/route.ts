import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { excedeuLimite } from "@/lib/rateLimit";
import { GeminiIndisponivelError, analisarRotulo } from "@/lib/gemini";
import { logAccess } from "@/lib/sheets/log";

// A foto já vem comprimida do cliente (`preparePhoto`, ver photoUpload.ts) - este teto é rede de
// segurança contra payload gigante batendo direto na rota.
const MAX_BASE64_LEN = 6_000_000;

// O free tier do Gemini limita req/min por CHAVE (a conta inteira, não por pessoa - todos os
// usuários do app compartilham a mesma). Um teto apertado por usuário evita que clique duplo ou
// retry de rede estourem a cota de todo mundo. Mesmo raciocínio da rota `analisar` do TravelTrack.
const LIMITE = 6;
const JANELA_MS = 60_000;

const bodySchema = z.object({
  base64Data: z.string().min(1).max(MAX_BASE64_LEN),
  mimeType: z.string().min(1).max(100),
});

/** Lê a foto de um rótulo de cerveja e devolve os campos identificados (nome, cervejaria, país,
 *  estilo, ABV, IBU). Best-effort: falha vira 503 "preencha à mão", nunca erro fatal. */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  if (excedeuLimite(`analisar-rotulo:${auth.session.user.id}`, { limite: LIMITE, janelaMs: JANELA_MS })) {
    return errorResponse("Muitas leituras em pouco tempo — aguarde um minuto.", 429);
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const campos = await analisarRotulo(parsed.data.base64Data, parsed.data.mimeType);
    void logAccess({
      userId: auth.session.user.id,
      userMail: auth.session.user.email ?? "",
      acao: "leu rótulo de cerveja (IA)",
      tabela: "beer",
      registroId: "",
    });
    return NextResponse.json(campos);
  } catch (err) {
    if (err instanceof GeminiIndisponivelError) {
      return errorResponse("Não deu pra ler o rótulo automaticamente — preencha os campos à mão.", 503);
    }
    throw err;
  }
}
