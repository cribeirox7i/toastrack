import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { listVisibleIndex } from "@/lib/sheets/items";
import type { ItemType } from "@/lib/sheets/types";

const TIPOS = ["beer", "wine", "dest", "drink"] as const;

function parseTipo(raw: string): ItemType | null {
  return (TIPOS as readonly string[]).includes(raw) ? (raw as ItemType) : null;
}

/**
 * Índice de sincronização da aba: `[{ id, h }]` — um hash do conteúdo por linha, sem os campos de
 * dado. É o que substituiu a leitura da aba inteira na reconciliação: o `beer` real são 1,84 MB
 * em `GET /api/items/beer` (de 10s a 2min38, com 1 em 5 respondendo 500) contra ~55 KB aqui. O
 * cliente compara com os hashes que guardou e pede só as linhas diferentes em `by-ids`.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const tipo = parseTipo((await params).tipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  return NextResponse.json(await listVisibleIndex(tipo, auth.session.user.id));
}
