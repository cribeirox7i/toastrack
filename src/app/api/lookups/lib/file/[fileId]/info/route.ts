import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { fetchLibFileInfo } from "@/lib/sheets/lookups";

/** Nome + mimeType de um arquivo da Biblioteca, sem baixar os bytes — a tela usa isto pra decidir
 *  se abre inline (PDF/imagem), oferece baixar (DOCX/XLSX) ou recusa (qualquer outro tipo). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { fileId } = await params;
  try {
    const info = await fetchLibFileInfo(fileId);
    return NextResponse.json(info);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Arquivo não encontrado", 404);
  }
}
