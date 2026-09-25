import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiHelpers";
import { fetchLib } from "@/lib/sheets/lookups";

/** Conteúdo da tela Biblioteca — separado de /api/lookups porque só é usado ali, sem sentido
 *  puxar junto de países/BJCP em todo round-trip de detalhe/edição de item. */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const lib = await fetchLib();
  return NextResponse.json(lib);
}
