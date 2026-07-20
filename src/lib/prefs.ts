import { getSupabaseClient } from "@/lib/supabase/client";
import { logAccess } from "@/lib/auth";

/** Patch of user-editable profile/preference columns. */
export type PrefsPatch = Partial<{
  user_nome: string;
  user_paleta: string;
  user_modo: "light" | "dark";
  user_idioma: "PT" | "EN" | "ES";
}>;

/** Save profile/preference fields to the user's own row (RLS: own row only). */
export async function saveUserPrefs(userId: string, patch: PrefsPatch): Promise<boolean> {
  const { error } = await getSupabaseClient().from("user").update(patch).eq("user_id", userId);
  if (error) {
    console.error("saveUserPrefs error:", error.message);
    return false;
  }
  return true;
}

/** Change password: re-authenticate with the current password, then update.
 *  Supabase's updateUser doesn't verify the old password, so we check it first. */
export async function changePassword(
  email: string,
  current: string,
  next: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
  if (authErr) return { ok: false, error: "Senha atual incorreta." };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: error.message };
  void logAccess("alterou a senha");
  return { ok: true };
}
