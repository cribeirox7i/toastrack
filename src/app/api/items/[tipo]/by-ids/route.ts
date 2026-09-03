import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { listVisibleItemsByIds } from "@/lib/sheets/items";
import type { ItemType } from "@/lib/sheets/types";

const TIPOS = ["beer", "wine", "dest", "drink"] as const;

function parseTipo(raw: string): ItemType | null {
  return (TIPOS as readonly string[]).includes(raw) ? (raw as ItemType) : null;
}

// Lote limitado de propósito: é o tamanho que mantém a resposta na casa das centenas de KB, que
// foi o ponto todo de parar de ler a aba inteira (ver sync-index/route.ts).
const bodySchema = z.object({ ids: z.array(z.string()).min(1).max(500) });

/**
 * Devolve só as linhas pedidas por id, já filtradas por permissão — par do `sync-index`. É POST
 * porque a lista de ids não cabe confortavelmente numa query string (um lote são centenas de
 * ids), não porque escreva alguma coisa.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const tipo = parseTipo((await params).tipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  return NextResponse.json(
    await listVisibleItemsByIds(tipo, parsed.data.ids, auth.session.user.id)
  );
}
