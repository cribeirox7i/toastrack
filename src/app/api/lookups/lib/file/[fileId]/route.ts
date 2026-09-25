import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { downloadLibFile } from "@/lib/sheets/lookups";

/** Bytes de um arquivo da Biblioteca, servidos inline — nunca o link cru do Drive, que pede login
 *  Google. Mesmo padrão do TravelTrack (`AnexoViewer`/`drive-files/[fileId]`). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { fileId } = await params;
  try {
    const { name, mimeType, base64Data } = await downloadLibFile(fileId);
    const buffer = Buffer.from(base64Data, "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
      },
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Arquivo não encontrado", 404);
  }
}
