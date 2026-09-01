import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/apiHelpers";
import { listVisibleItems, listVisibleItemsSince, createItem } from "@/lib/sheets/items";
import type { ItemType } from "@/lib/sheets/types";

const TIPOS = ["beer", "wine", "dest", "drink"] as const;

function parseTipo(raw: string): ItemType | null {
  return (TIPOS as readonly string[]).includes(raw) ? (raw as ItemType) : null;
}

// Conteúdo do item é livre (varia por tipo: beer_nome, wine_cor, ...) — validado como um mapa de
// strings. createItem() é quem neutraliza qualquer tentativa de mandar user_owner/updated_at
// no corpo (sempre sobrescritos com o valor calculado no servidor), então não precisa filtrar
// aqui; só garante que o formato geral é são. `id` é opcional — ver createItem, etapa 6: o
// cliente manda o uuid gerado localmente quando cria offline, pra manter a mesma referência.
const createSchema = z.record(z.string(), z.string());

export async function GET(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const tipo = parseTipo((await params).tipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  const since = req.nextUrl.searchParams.get("since");
  const itens = since
    ? await listVisibleItemsSince(tipo, auth.session.user.id, since)
    : await listVisibleItems(tipo, auth.session.user.id);
  return NextResponse.json(itens);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const tipo = parseTipo((await params).tipo);
  if (!tipo) return errorResponse("Tipo de item inválido", 404);

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const item = await createItem(tipo, parsed.data, auth.session.user.id);
  return NextResponse.json(item, { status: 201 });
}
