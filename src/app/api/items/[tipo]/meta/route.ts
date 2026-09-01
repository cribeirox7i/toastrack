import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { getItemsStamp } from "@/lib/sheets/items";
import type { ItemType } from "@/lib/sheets/types";

const TIPOS = ["beer", "wine", "dest", "drink"] as const;

function parseTipo(raw: string): ItemType | null {
  return (TIPOS as readonly string[]).includes(raw) ? (raw as ItemType) : null;
}

/** Carimbo de última escrita da aba (etapa 6 — cache local) — chamada barata que não lê a aba de
 *  item, só SyncMeta. O cliente compara com o que já tem salvo antes de decidir se vale a pena
 *  puxar algo (`readSince`) ou se o cache já está em dia. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const tipo = parseTipo((await params).tipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  const updatedAt = await getItemsStamp(tipo);
  return NextResponse.json({ updatedAt });
}
