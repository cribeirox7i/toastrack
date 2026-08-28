/** Patch of user-editable profile/preference columns. */
export type PrefsPatch = Partial<{
  user_nome: string;
  user_paleta: string;
  user_modo: "light" | "dark";
  user_idioma: "pt" | "en" | "es";
}>;

/** Salva campos de perfil/preferência na própria linha (a rota só deixa mexer na sessão logada). */
export async function saveUserPrefs(patch: PrefsPatch): Promise<boolean> {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

/** Troca a senha do usuário logado (a rota reautentica com a senha atual antes de trocar). */
export async function changePassword(
  senhaAtual: string,
  senhaNova: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/profile/senha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ senhaAtual, senhaNova }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, error: body.error ?? "Erro ao alterar senha." };
}
