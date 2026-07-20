import { getSupabaseClient } from "@/lib/supabase/client";
import { logAccess } from "@/lib/auth";

export type AdminUser = {
  user_id: string;
  user_nome: string;
  user_mail: string;
  user_status: "S" | "N";
  user_role: "admin" | "user";
};

export type LogEntry = {
  log_id: number;
  ts: string;
  action: string;
  user_id: string | null;
};

/** All users (admin only — RLS `user_admin_select` gates this). */
export async function fetchAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await getSupabaseClient()
    .from("user")
    .select("user_id,user_nome,user_mail,user_status,user_role")
    .order("user_nome");
  if (error) {
    console.error("fetchAllUsers error:", error.message);
    return [];
  }
  return (data ?? []) as AdminUser[];
}

/** Activate ('S') / deactivate ('N') a user (admin only; guard trigger allows
 *  the change because the caller is an admin). */
export async function setUserStatus(userId: string, status: "S" | "N"): Promise<boolean> {
  const { error } = await getSupabaseClient()
    .from("user")
    .update({ user_status: status })
    .eq("user_id", userId);
  if (error) {
    console.error("setUserStatus error:", error.message);
    return false;
  }
  void logAccess(status === "S" ? "ativou usuário" : "desativou usuário", "user");
  return true;
}

/** Recent access-log entries (admin only — RLS `access_log_admin_read`). */
export async function fetchAccessLog(limit = 50): Promise<LogEntry[]> {
  const { data, error } = await getSupabaseClient()
    .from("access_log")
    .select("log_id,ts,action,user_id")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("fetchAccessLog error:", error.message);
    return [];
  }
  return (data ?? []) as LogEntry[];
}
