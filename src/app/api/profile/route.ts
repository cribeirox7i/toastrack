import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { fetchUserById, updateOwnProfile, toPublicUser } from "@/lib/sheets/users";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const user = await fetchUserById(auth.session.user.id);
  if (!user) return errorResponse("Usuário não encontrado", 404);
  return NextResponse.json(toPublicUser(user));
}

const patchSchema = z.object({
  user_nome: z.string().min(1).optional(),
  user_idioma: z.enum(["pt", "en", "es"]).optional(),
  user_paleta: z.string().optional(),
  user_modo: z.enum(["light", "dark"]).optional(),
  user_url_img: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  await updateOwnProfile(auth.session.user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
