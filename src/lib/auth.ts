import { getSupabaseClient } from "@/lib/supabase/client";

/** Password policy from spec C.2: 8+ chars, upper, lower, number, special.
 *  Enforced client-side here; also enable Supabase's password policy in the
 *  dashboard (Auth settings) so it's enforced server-side too. */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function validatePassword(pw: string): boolean {
  return PASSWORD_REGEX.test(pw || "");
}

/** Shape of a public."user" row we care about in the client. */
export type AppUser = {
  user_id: string;
  user_nome: string;
  user_mail: string;
  user_status: "S" | "N";
  user_role: "admin" | "user";
  user_idioma: "PT" | "EN" | "ES";
  user_paleta: string;
  user_modo: "light" | "dark";
  user_img: string | null;
};

const APP_USER_COLUMNS =
  "user_id, user_nome, user_mail, user_status, user_role, user_idioma, user_paleta, user_modo, user_img";

/** Fetch the app profile row for a given auth user id (RLS allows own row). */
export async function fetchAppUser(userId: string): Promise<AppUser | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user")
    .select(APP_USER_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("fetchAppUser error:", error.message);
    return null;
  }
  return (data as AppUser) ?? null;
}

/** Write an audit-log entry via the RLS-safe RPC (stamps user_id server-side). */
export async function logAccess(
  action: string,
  entityType?: string,
  entityId?: number,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("log_access", {
    p_action: action,
    p_entity_type: entityType ?? null,
    p_entity_id: entityId ?? null,
  });
  if (error) console.error("logAccess error:", error.message);
}
