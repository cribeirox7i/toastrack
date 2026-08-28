import "server-only";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";

/** Mesmo padrão do TravelTrack (`C:\Claude\TravelTrack\src\lib\api-helpers.ts`) — toda rota
 *  autenticada passa por aqui em vez de chamar `auth()` solta, pra nunca esquecer a checagem. */

export type ApiSession = Session;

export async function requireSession(): Promise<
  { session: ApiSession } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  return { session };
}

export async function requireAdmin(): Promise<
  { session: ApiSession } | { error: NextResponse }
> {
  const result = await requireSession();
  if ("error" in result) return result;
  if (result.session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "Acesso restrito ao admin" }, { status: 403 }) };
  }
  return result;
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
