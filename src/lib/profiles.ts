import { getSupabaseClient } from "@/lib/supabase/client";

/** A secondary (followed) profile the current user may browse read-only. */
export type SecondaryProfile = {
  id: string;
  name: string;
  img: string | null;
};

/** Followed profiles for the current user, via the RLS-safe RPC (name+avatar only). */
export async function fetchFollowedProfiles(): Promise<SecondaryProfile[]> {
  const { data, error } = await getSupabaseClient().rpc("followed_profiles");
  if (error) {
    console.error("fetchFollowedProfiles error:", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string; user_nome: string; user_img: string | null }) => ({
    id: r.user_id,
    name: r.user_nome,
    img: r.user_img,
  }));
}
