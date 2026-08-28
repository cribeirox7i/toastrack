import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { getItemIfVisible, updateItem, deleteItem } from "@/lib/sheets/items";
import type { ItemType } from "@/lib/sheets/types";

const TIPOS = ["beer", "wine", "dest", "drink"] as const;

function parseTipo(raw: string): ItemType | null {
  return (TIPOS as readonly string[]).includes(raw) ? (raw as ItemType) : null;
}

const patchSchema = z.record(z.string(), z.string());

type Params = { tipo: string; id: string };

export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { tipo: rawTipo, id } = await params;
  const tipo = parseTipo(rawTipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  const item = await getItemIfVisible(tipo, id, auth.session.user.id);
  if (!item) return errorResponse("Item não encontrado", 404);
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { tipo: rawTipo, id } = await params;
  const tipo = parseTipo(rawTipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const resultado = await updateItem(tipo, id, parsed.data, auth.session.user.id);
  if (resultado === "not_found") return errorResponse("Item não encontrado", 404);
  if (resultado === "forbidden") return errorResponse("Sem permissão para editar este item", 403);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { tipo: rawTipo, id } = await params;
  const tipo = parseTipo(rawTipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  const resultado = await deleteItem(tipo, id, auth.session.user.id);
  if (resultado === "not_found") return errorResponse("Item não encontrado", 404);
  if (resultado === "forbidden") return errorResponse("Sem permissão para excluir este item", 403);
  return NextResponse.json({ ok: true });
}
