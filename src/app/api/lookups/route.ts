import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiHelpers";
import { fetchPaises, fetchBjcp } from "@/lib/sheets/lookups";

/** Países e estilos BJCP num só round-trip (as duas listas são pequenas e sempre usadas juntas
 *  pelas telas de detalhe/edição). */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const [paises, bjcp] = await Promise.all([fetchPaises(), fetchBjcp()]);
  return NextResponse.json({ paises, bjcp });
}
