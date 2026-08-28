import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiHelpers";
import { fetchLog } from "@/lib/sheets/log";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const linhas = await fetchLog();
  return NextResponse.json(linhas);
}
