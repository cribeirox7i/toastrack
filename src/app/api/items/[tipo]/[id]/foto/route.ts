import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { uploadItemPhoto } from "@/lib/sheets/items";
import type { ItemType } from "@/lib/sheets/types";

const TIPOS = ["beer", "wine", "dest", "drink"] as const;

function parseTipo(raw: string): ItemType | null {
  return (TIPOS as readonly string[]).includes(raw) ? (raw as ItemType) : null;
}

type Params = { tipo: string; id: string };

// 6MB de base64 ~= 4.4MB de arquivo real — a compressão client-side (ver src/lib/photoUpload.ts)
// já deixa a foto bem menor que isso; este limite é só uma rede de segurança contra payload
// gigante batendo direto na rota (fora do fluxo normal da UI).
const MAX_BASE64_LEN = 6_000_000;

const bodySchema = z.object({
  base64Data: z.string().min(1).max(MAX_BASE64_LEN),
  mimeType: z.string().min(1).max(100),
  filename: z.string().min(1).max(200),
});

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { tipo: rawTipo, id } = await params;
  const tipo = parseTipo(rawTipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const resultado = await uploadItemPhoto(tipo, id, auth.session.user.id, parsed.data);
  if (!resultado.ok) {
    if (resultado.reason === "not_found") return errorResponse("Item não encontrado", 404);
    return errorResponse("Sem permissão para editar este item", 403);
  }
  return NextResponse.json({ url: resultado.url, imgNome: resultado.imgNome });
}
