import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/apiHelpers";
import { setUserPrivileges } from "@/lib/sheets/users";
import { logAccess } from "@/lib/sheets/log";

const patchSchema = z.object({
  user_role: z.enum(["admin", "user"]).optional(),
  user_status: z.enum(["S", "N"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  // Sem guard próprio contra "admin desativa a si mesmo" ainda (mesmo foot-gun já anotado no
  // MEMORIA.md antigo, seção 3.13) — desativar/ativar de verdade precisa de um 2º admin pra
  // testar com segurança; adicionar o guard quando for útil de fato.
  await setUserPrivileges(id, parsed.data);
  void logAccess({
    userId: auth.session.user.id,
    userMail: auth.session.user.email ?? "",
    acao: "alterou privilégios de usuário",
    tabela: "user",
    registroId: id,
    detalhe: JSON.stringify(parsed.data),
  });
  return NextResponse.json({ ok: true });
}
