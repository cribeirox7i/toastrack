import "server-only";
import { randomUUID } from "node:crypto";
import { callAppsScript } from "./client";
import { hashPassword, generateProvisionalPassword, verifyPassword } from "@/lib/authCrypto";
import { DEFAULT_HUE, DEFAULT_MODE, hueToPaletteEnum } from "@/lib/theme";
import type { UserRow } from "./types";

/**
 * Repositório da aba `user`. Sem cadastro público (decisão da migração, ver MIGRACAO_SHEETS.md
 * seção 8) — só uma rota de admin cria usuário, com senha provisória (padrão do WebCRM, ver
 * seção 4.1 do plano). A chave natural aqui é `user_id`; a aba não passa por updateById porque
 * nunca foi renomeada pra ter uma coluna "id" literal (ver seção 3).
 */

export async function fetchAllUsers(): Promise<UserRow[]> {
  return callAppsScript<UserRow[]>("read", { tab: "user" });
}

export type PublicUser = Omit<UserRow, "senha_hash" | "convite_token" | "convite_expira_em">;

/** Nunca deixar `senha_hash`/`convite_token`/`convite_expira_em` chegar numa resposta de API —
 *  toda rota que devolve um UserRow pro cliente passa por aqui antes. */
export function toPublicUser(user: UserRow): PublicUser {
  const { senha_hash: _senhaHash, convite_token: _conviteToken, convite_expira_em: _conviteExpiraEm, ...rest } = user;
  void _senhaHash;
  void _conviteToken;
  void _conviteExpiraEm;
  return rest;
}

export async function fetchUserById(userId: string): Promise<UserRow | null> {
  const users = await fetchAllUsers();
  return users.find((u) => u.user_id === userId) ?? null;
}

/** E-mail não é chave única garantida pela planilha (é texto livre) — devolve a primeira que
 *  bater, comparando sem diferenciar maiúscula (mesma tolerância que um login de verdade espera). */
export async function fetchUserByEmail(email: string): Promise<UserRow | null> {
  const alvo = email.trim().toLowerCase();
  const users = await fetchAllUsers();
  return users.find((u) => (u.user_mail ?? "").trim().toLowerCase() === alvo) ?? null;
}

export interface CreateUserResult {
  user: UserRow;
  /** Senha em texto puro, gerada agora — só existe neste retorno, nunca gravada nem logada em
   *  lugar nenhum. Quem chamou isto (a rota de admin) mostra pro admin uma única vez. */
  provisionalPassword: string;
}

/**
 * Cria um usuário novo (só admin — a checagem de "quem está chamando é admin" é da rota, não
 * daqui). Gera senha provisória e marca `deve_trocar_senha`, pro dono da conta trocar no primeiro
 * login (mesmo fluxo do WebCRM). Falha se já existir alguém com esse e-mail.
 */
export async function createUser(input: {
  nome: string;
  email: string;
  role?: "admin" | "user";
}): Promise<CreateUserResult> {
  const existente = await fetchUserByEmail(input.email);
  if (existente) throw new Error("Já existe um usuário com este e-mail.");

  const provisionalPassword = generateProvisionalPassword();
  const user: UserRow = {
    user_id: randomUUID(),
    user_nome: input.nome.trim(),
    user_mail: input.email.trim(),
    user_status: "S",
    user_role: input.role ?? "user",
    user_idioma: "pt",
    // Antes hardcoded "verde"/"light" com grafia divergente do enum real (theme.ts compara
    // exato, "Verde" != "verde" — caía no fallback "green" de qualquer jeito). Agora usa o
    // padrão atual do produto (ver DEFAULT_HUE/DEFAULT_MODE, decisão do Carlos 2026-09-02).
    user_paleta: hueToPaletteEnum(DEFAULT_HUE),
    user_modo: DEFAULT_MODE,
    user_url_img: "",
    senha_hash: hashPassword(provisionalPassword),
    deve_trocar_senha: "true",
    convite_token: "",
    convite_expira_em: "",
  };
  await callAppsScript("append", { tab: "user", rows: [user] });
  return { user, provisionalPassword };
}

/** Confere e-mail/senha. Devolve o usuário se bater e a conta estiver ativa; null caso contrário —
 *  de propósito não diferencia "senha errada" de "e-mail não existe" nem "conta inativa" pro
 *  chamador (a rota decide a mensagem exibida, sem vazar qual caso é). */
export async function verifyCredentials(email: string, senha: string): Promise<UserRow | null> {
  const user = await fetchUserByEmail(email);
  if (!user) return null;
  if (user.user_status !== "S") return null;
  if (!verifyPassword(senha, user.senha_hash)) return null;
  return user;
}

/** Troca a senha do próprio usuário (reautentica com a senha atual antes) e limpa
 *  `deve_trocar_senha`. */
export async function changeOwnPassword(
  userId: string,
  senhaAtual: string,
  senhaNova: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await fetchUserById(userId);
  if (!user) return { ok: false, error: "Usuário não encontrado." };
  if (!verifyPassword(senhaAtual, user.senha_hash)) {
    return { ok: false, error: "Senha atual incorreta." };
  }
  await callAppsScript("updateByField", {
    tab: "user",
    campo: "user_id",
    valor: userId,
    patch: { senha_hash: hashPassword(senhaNova), deve_trocar_senha: "false" },
  });
  return { ok: true };
}

/**
 * Admin define a senha de outra pessoa diretamente (sem fluxo de convite) — mesmo atalho do
 * WebCRM (`PUT /api/usuarios/:id/senha`). Força `deve_trocar_senha` de novo: o dono da conta
 * ainda decide a senha real que vai usar de fato.
 */
export async function adminResetPassword(userId: string): Promise<{ provisionalPassword: string }> {
  const provisionalPassword = generateProvisionalPassword();
  await callAppsScript("updateByField", {
    tab: "user",
    campo: "user_id",
    valor: userId,
    patch: { senha_hash: hashPassword(provisionalPassword), deve_trocar_senha: "true" },
  });
  return { provisionalPassword };
}

/**
 * Muda role/status de outro usuário — só chamar depois de confirmar, na rota, que a sessão é
 * admin (equivalente ao trigger `guard_user_privileges` do Supabase, que não existe mais aqui).
 */
export async function setUserPrivileges(
  userId: string,
  patch: Partial<Pick<UserRow, "user_role" | "user_status">>
): Promise<void> {
  await callAppsScript("updateByField", { tab: "user", campo: "user_id", valor: userId, patch });
}

/** Atualiza campos de perfil que o próprio usuário edita (nome, idioma, paleta, modo, foto). */
export async function updateOwnProfile(
  userId: string,
  patch: Partial<Pick<UserRow, "user_nome" | "user_idioma" | "user_paleta" | "user_modo" | "user_url_img">>
): Promise<void> {
  await callAppsScript("updateByField", { tab: "user", campo: "user_id", valor: userId, patch });
}
