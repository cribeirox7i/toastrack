import { noCacheUrl } from "@/lib/utils";

export type AdminUser = {
  user_id: string;
  user_nome: string;
  user_mail: string;
  user_status: "S" | "N";
  user_role: "admin" | "user" | "";
};

export type LogEntry = {
  log_id: string;
  ts: string;
  action: string;
  user_id: string | null;
  user_mail: string;
};

/** Todos os usuários (só admin — a rota confere `requireAdmin`). */
export async function fetchAllUsers(): Promise<AdminUser[]> {
  const res = await fetch(noCacheUrl("/api/admin/users"), { cache: "no-store" });
  if (!res.ok) return [];
  const users = (await res.json()) as AdminUser[];
  return [...users].sort((a, b) => a.user_nome.localeCompare(b.user_nome));
}

/** Ativa ('S') / desativa ('N') um usuário (só admin). */
export async function setUserStatus(userId: string, status: "S" | "N"): Promise<boolean> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_status: status }),
  });
  return res.ok;
}

/** Log de acesso recente (só admin) — mais novo primeiro. */
export async function fetchAccessLog(limit = 50): Promise<LogEntry[]> {
  const res = await fetch(noCacheUrl("/api/admin/log"), { cache: "no-store" });
  if (!res.ok) return [];
  const rows = (await res.json()) as {
    log_id: string;
    log_data: string;
    acao: string;
    user_id: string;
    user_mail: string;
  }[];
  return rows
    .slice()
    .reverse()
    .slice(0, limit)
    .map((r) => ({ log_id: r.log_id, ts: r.log_data, action: r.acao, user_id: r.user_id || null, user_mail: r.user_mail }));
}
