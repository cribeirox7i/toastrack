import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiHelpers";
import { getItemsStamp } from "@/lib/sheets/items";
import type { ItemType } from "@/lib/sheets/types";

const TIPOS: ItemType[] = ["beer", "wine", "dest", "drink"];

/** Os 4 carimbos de uma vez. O cliente checava um por aba (`/api/items/[tipo]/meta`) = 4 funções
 *  serverless por ciclo, cada uma parada esperando o Apps Script; aqui é UMA função com as 4
 *  chamadas em paralelo, então o tempo (e a memória) cobrado é o da mais lenta, não a soma. */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const stamps = await Promise.all(TIPOS.map((t) => getItemsStamp(t)));
  return NextResponse.json(Object.fromEntries(TIPOS.map((t, i) => [t, stamps[i]])));
}
