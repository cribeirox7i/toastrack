import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/apiHelpers";
import { fetchAllUsers, createUser, toPublicUser } from "@/lib/sheets/users";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const users = await fetchAllUsers();
  return NextResponse.json(users.map(toPublicUser));
}

const createSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "user"]).optional(),
});

/**
 * Cria usuário com senha provisória (mesmo caminho de scripts/create-admin.mjs, ver
 * MIGRACAO_SHEETS.md seção 4.1) — a senha volta na resposta pra tela mostrar UMA vez ao admin;
 * não fica salva em lugar nenhum além do hash.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const { user, provisionalPassword } = await createUser(parsed.data);
    return NextResponse.json({ user: toPublicUser(user), provisionalPassword }, { status: 201 });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao criar usuário");
  }
}
