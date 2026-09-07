import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { uploadProfilePhoto } from "@/lib/sheets/users";
import { logAccess } from "@/lib/sheets/log";

// Rede de segurança contra payload gigante batendo direto na rota - a compressão do cliente
// (`preparePhoto`, ver src/lib/photoUpload.ts) já deixa a foto bem menor que isto.
const MAX_BASE64_LEN = 6_000_000;

const bodySchema = z.object({
  base64Data: z.string().min(1).max(MAX_BASE64_LEN),
  mimeType: z.string().min(1).max(100),
});

/** Foto de perfil do usuário logado - só a própria (a sessão define o userId, nunca o corpo). */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const { url } = await uploadProfilePhoto(auth.session.user.id, parsed.data);
    void logAccess({
      userId: auth.session.user.id,
      userMail: auth.session.user.email ?? "",
      acao: "atualizou foto de perfil",
      tabela: "user",
      registroId: auth.session.user.id,
    });
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao enviar a foto", 502);
  }
}
