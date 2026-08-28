import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiHelpers";
import { adminResetPassword } from "@/lib/sheets/users";
import { logAccess } from "@/lib/sheets/log";

/** Mesmo atalho do WebCRM (`PUT /api/usuarios/:id/senha`): admin gera senha provisória nova pra
 *  outra pessoa, sem passar pelo fluxo de convite por e-mail. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { provisionalPassword } = await adminResetPassword(id);

  void logAccess({
    userId: auth.session.user.id,
    userMail: auth.session.user.email ?? "",
    acao: "resetou senha de usuário",
    tabela: "user",
    registroId: id,
  });
  return NextResponse.json({ provisionalPassword });
}
