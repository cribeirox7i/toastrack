import { preparePhoto } from "@/lib/photoUpload";

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

/**
 * Comprime a foto no navegador (mesma escadinha do upload de foto de item, ver `preparePhoto`) e
 * sobe pra `/api/profile/foto`, que grava a URL do Drive em `user_url_img`. Devolve a URL nova pra
 * quem chama atualizar o `appUser` (`refreshAppUser`). Não usa outbox: precisa de rede na hora pra
 * saber a URL que o Drive retornou - falha com mensagem clara se offline, mesma postura das fotos.
 */
export async function uploadProfilePhoto(
  file: File,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "Sem conexão — a foto não foi enviada." };
  }
  const prep = await preparePhoto(file);
  if (!prep.ok) return { ok: false, error: prep.error };
  try {
    const res = await fetch("/api/profile/foto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data: prep.photo.base64, mimeType: prep.photo.mimeType }),
      signal: "timeout" in AbortSignal ? AbortSignal.timeout(180_000) : undefined,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Erro ao enviar a foto." };
    }
    const { url } = (await res.json()) as { url: string };
    return { ok: true, url };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ok: false, error: "A foto demorou demais pra subir. Tente de novo." };
    }
    return { ok: false, error: "Erro de rede ao enviar a foto." };
  }
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
