import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { changeOwnPassword } from "@/lib/sheets/users";
import { logAccess } from "@/lib/sheets/log";
import { senhaSchema } from "@/lib/senhaSchema";

const bodySchema = z.object({
  senhaAtual: z.string().min(1),
  senhaNova: senhaSchema,
});

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const { user } = auth.session;
  const resultado = await changeOwnPassword(user.id, parsed.data.senhaAtual, parsed.data.senhaNova);
  if (!resultado.ok) return errorResponse(resultado.error, 400);

  void logAccess({ userId: user.id, userMail: user.email ?? "", acao: "alterou a senha" });
  // Front precisa chamar update({ deveTrocarSenha: false }) do useSession logo depois desta
  // resposta OK — ver TODO em src/auth.ts sobre a sessão JWT não se atualizar sozinha.
  return NextResponse.json({ ok: true });
}
