"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import Icon from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { PALETTES, hueToPaletteEnum, type HueName } from "@/lib/theme";
import { validatePassword } from "@/lib/auth";
import { saveUserPrefs, changePassword, uploadProfilePhoto } from "@/lib/prefs";
import { refreshAllNow } from "@/lib/offline/sync";
import { buildLabel } from "@/lib/version";
import {
  fetchAllUsers,
  setUserStatus,
  resetUserPassword,
  fetchAccessLog,
  type AdminUser,
  type LogEntry,
} from "@/lib/admin";

function formatTs(ts: string): string {
  const d = new Date(ts);
  return isNaN(d.getTime())
    ? ts
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const cardCls = "rounded-2xl border border-border bg-surface p-4";
const cardLabel = "mb-3 text-[11px] font-bold uppercase tracking-wider text-muted";
const inputCls =
  "w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[14px] outline-none focus:border-accent";

const LANGS: { code: "pt" | "en" | "es"; label: string }[] = [
  { code: "pt", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export default function ProfileScreen() {
  const { userId: sessionUserId, userEmail, appUser, signOut, refreshAppUser } = useAuth();
  const { hue, mode, mounted, setHue, setMode } = useTheme();

  const userId = sessionUserId ?? "";
  const email = appUser?.user_mail ?? userEmail ?? "";

  const [name, setName] = useState(appUser?.user_nome ?? "");
  const [savingName, setSavingName] = useState(false);
  const [lang, setLang] = useState<"pt" | "en" | "es">(
    (appUser?.user_idioma as "pt" | "en" | "es") ?? "pt",
  );

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const fotoInputRef = useRef<HTMLInputElement | null>(null);
  const [fotoBusy, setFotoBusy] = useState(false);

  async function onFotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFotoBusy(true);
    const r = await uploadProfilePhoto(file);
    setFotoBusy(false);
    if (r.ok) {
      await refreshAppUser();
      showToast("Foto atualizada");
    } else {
      showToast(r.error ?? "Erro ao enviar a foto");
    }
  }

  const [toast, setToast] = useState("");
  function showToast(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(""), 2200);
  }

  const [syncing, setSyncing] = useState(false);
  async function doRefreshAll() {
    setSyncing(true);
    try {
      await refreshAllNow();
      showToast("Dados atualizados");
    } catch {
      showToast("Erro ao atualizar");
    } finally {
      setSyncing(false);
    }
  }

  // ---- Admin ----
  const isAdmin = appUser?.user_role === "admin";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // Fluxo de reset de senha: confirma, gera, mostra a senha UMA vez (não fica salva em texto).
  const [resetAlvo, setResetAlvo] = useState<AdminUser | null>(null);
  const [resetResultado, setResetResultado] = useState<{ nome: string; senha: string } | null>(null);
  const [resetando, setResetando] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAllUsers().then(setUsers);
    fetchAccessLog().then(setLogs);
  }, [isAdmin]);

  const userNameById = useMemo(() => {
    const m = new Map(users.map((u) => [u.user_id, u.user_mail]));
    return (id: string | null) => (id ? (m.get(id) ?? id.slice(0, 8)) : "sistema");
  }, [users]);

  async function toggleStatus(u: AdminUser) {
    const next: "S" | "N" = u.user_status === "S" ? "N" : "S";
    const ok = await setUserStatus(u.user_id, next);
    if (ok) {
      setUsers(await fetchAllUsers());
      showToast(next === "S" ? "Usuário ativado" : "Usuário desativado");
    } else showToast("Erro");
  }

  async function confirmarReset() {
    if (!resetAlvo) return;
    setResetando(true);
    const senha = await resetUserPassword(resetAlvo.user_id);
    setResetando(false);
    const nome = resetAlvo.user_nome;
    setResetAlvo(null);
    if (senha) setResetResultado({ nome, senha });
    else showToast("Erro ao resetar senha");
  }

  async function copiarSenha(senha: string) {
    try {
      await navigator.clipboard.writeText(senha);
      showToast("Senha copiada");
    } catch {
      showToast("Copie manualmente");
    }
  }

  async function saveName() {
    if (!name.trim() || !userId) return;
    setSavingName(true);
    const ok = await saveUserPrefs({ user_nome: name.trim() });
    setSavingName(false);
    if (ok) {
      await refreshAppUser();
      showToast("Nome salvo");
    } else showToast("Erro ao salvar");
  }

  async function pickPalette(h: HueName) {
    setHue(h);
    if (userId) await saveUserPrefs({ user_paleta: hueToPaletteEnum(h) });
  }
  async function pickMode(m: "light" | "dark") {
    setMode(m);
    if (userId) await saveUserPrefs({ user_modo: m });
  }
  async function pickLang(code: "pt" | "en" | "es") {
    setLang(code);
    if (userId) {
      await saveUserPrefs({ user_idioma: code });
      await refreshAppUser();
    }
  }

  async function submitPassword() {
    setPwError("");
    if (!pw.current || !pw.next) {
      setPwError("Preencha os campos.");
      return;
    }
    if (!validatePassword(pw.next)) {
      setPwError("Nova senha: mín. 8 caracteres, com maiúscula, minúscula, número e símbolo.");
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError("A confirmação não confere.");
      return;
    }
    setPwBusy(true);
    const res = await changePassword(pw.current, pw.next);
    setPwBusy(false);
    if (!res.ok) {
      setPwError(res.error ?? "Erro ao alterar senha.");
      return;
    }
    setPw({ current: "", next: "", confirm: "" });
    showToast("Senha alterada");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-6">
      {/* Identity */}
      <div className="flex flex-col items-center gap-2">
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFotoSelected(e)}
        />
        <button
          onClick={() => fotoInputRef.current?.click()}
          disabled={fotoBusy}
          aria-label="Trocar foto de perfil"
          className="relative"
        >
          <Avatar
            url={appUser?.user_url_img}
            name={name || email}
            className="size-[72px] text-[26px]"
          />
          <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-accent text-on-accent">
            <Icon name={fotoBusy ? "refresh" : "edit"} size={11} className={fotoBusy ? "animate-spin" : ""} />
          </span>
        </button>
        <div className="text-[13px] text-muted">{email}</div>
        {appUser?.user_role === "admin" && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
            admin
          </span>
        )}
      </div>

      {/* Display name */}
      <div className={cardCls}>
        <div className={cardLabel}>Nome de exibição</div>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <button
          onClick={saveName}
          disabled={savingName}
          className="mt-3 w-full rounded-xl bg-accent py-2.5 text-[13px] font-bold text-on-accent disabled:opacity-60"
        >
          {savingName ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {/* Language */}
      <div className={cardCls}>
        <div className={cardLabel}>Idioma</div>
        <div className="flex gap-1 rounded-xl border border-border p-1">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => pickLang(l.code)}
              className={`flex-1 rounded-lg px-2 py-2 text-[12.5px] font-bold transition ${
                lang === l.code ? "bg-accent text-on-accent" : "text-muted"
              }`}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11.5px] text-muted">
          Preferência salva. A tradução dos textos do app chega no passo de i18n.
        </div>
      </div>

      {/* Palette */}
      <div className={cardCls}>
        <div className={cardLabel}>Paleta de cores</div>
        <div className="flex flex-wrap gap-3">
          {PALETTES.map((p) => {
            const selected = mounted && hue === p.name;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => pickPalette(p.name)}
                title={p.labelPt}
                aria-pressed={selected}
                className="size-9 rounded-full"
                style={{
                  background: p.swatch,
                  boxShadow: selected
                    ? "0 0 0 3px var(--surface), 0 0 0 5px var(--text)"
                    : "0 0 0 2px var(--border)",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Mode */}
      <div className={cardCls}>
        <div className={cardLabel}>Modo</div>
        <div className="flex gap-1 rounded-xl border border-border p-1">
          {(["light", "dark"] as const).map((m) => {
            const active = mounted && mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => pickMode(m)}
                className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition ${
                  active ? "bg-accent text-on-accent" : "text-muted"
                }`}
              >
                {m === "light" ? "Claro" : "Escuro"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Change password */}
      <div className={cardCls}>
        <div className={cardLabel}>Alterar senha</div>
        <input
          type="password"
          value={pw.current}
          onChange={(e) => setPw((s) => ({ ...s, current: e.target.value }))}
          placeholder="Senha atual"
          className={`${inputCls} mb-2`}
        />
        <input
          type="password"
          value={pw.next}
          onChange={(e) => setPw((s) => ({ ...s, next: e.target.value }))}
          placeholder="Nova senha"
          className={`${inputCls} mb-2`}
        />
        <input
          type="password"
          value={pw.confirm}
          onChange={(e) => setPw((s) => ({ ...s, confirm: e.target.value }))}
          placeholder="Confirmar nova senha"
          className={inputCls}
        />
        {pwError && <div className="mt-2 text-[12.5px] font-semibold text-danger">{pwError}</div>}
        <button
          onClick={submitPassword}
          disabled={pwBusy}
          className="mt-3 w-full rounded-xl bg-accent py-2.5 text-[13px] font-bold text-on-accent disabled:opacity-60"
        >
          {pwBusy ? "Alterando…" : "Alterar senha"}
        </button>
      </div>

      {/* Admin: user management */}
      {isAdmin && (
        <div className={cardCls}>
          <div className={cardLabel}>Gestão de usuários</div>
          <div className="flex flex-col divide-y divide-border">
            {users.map((u) => (
              <div key={u.user_id} className="flex flex-col gap-2 py-2.5 first:pt-0">
                {/* Linha 1: nome, e-mail e status (pedido do Carlos 2026-09-07) */}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{u.user_nome}</div>
                    <div className="truncate text-[11.5px] text-muted">{u.user_mail}</div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                    style={{
                      background: u.user_status === "S" ? "var(--accent-soft)" : "var(--track)",
                      color: u.user_status === "S" ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    {u.user_status === "S" ? "ativo" : "inativo"}
                  </span>
                </div>
                {/* Linha 2: comandos */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setResetAlvo(u)}
                    className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-bold text-muted"
                  >
                    Resetar senha
                  </button>
                  <button
                    onClick={() => toggleStatus(u)}
                    className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-bold text-muted"
                  >
                    {u.user_status === "S" ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            ))}
            {users.length === 0 && <div className="py-2 text-center text-[13px] text-muted">—</div>}
          </div>
        </div>
      )}

      {/* Reset de senha: confirmação */}
      {resetAlvo && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-5 text-center">
            <div className="text-[15px] font-bold">Resetar a senha?</div>
            <div className="mt-1 text-[13px] text-muted">
              {resetAlvo.user_nome} vai receber uma senha provisória e precisará trocá-la no
              próximo login.
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setResetAlvo(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmarReset()}
                disabled={resetando}
                className="flex-1 rounded-xl bg-accent py-2.5 text-[13px] font-bold text-on-accent disabled:opacity-60"
              >
                {resetando ? "Gerando…" : "Resetar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset de senha: senha gerada, mostrada UMA vez */}
      {resetResultado && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-5 text-center">
            <div className="text-[15px] font-bold">Senha provisória</div>
            <div className="mt-1 text-[12.5px] text-muted">
              de {resetResultado.nome} — anote agora, ela não é exibida de novo.
            </div>
            <div className="mt-3 select-all rounded-xl border border-border bg-bg px-3 py-3 font-mono text-[16px] font-bold tracking-wide">
              {resetResultado.senha}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void copiarSenha(resetResultado.senha)}
                className="flex-1 rounded-xl border border-border py-2.5 text-[13px] font-bold"
              >
                Copiar
              </button>
              <button
                onClick={() => setResetResultado(null)}
                className="flex-1 rounded-xl bg-accent py-2.5 text-[13px] font-bold text-on-accent"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync: reconciliação completa (traz também exclusões feitas fora do app — o delta normal
          nunca traz isso, ver MIGRACAO_SHEETS.md seção 6) */}
      <div className={cardCls}>
        <div className={cardLabel}>Sincronização</div>
        <div className="mb-3 text-[12.5px] leading-relaxed text-muted">
          O app atualiza sozinho em segundo plano. Use isto se um item excluído em outro
          dispositivo ou direto na planilha continuar aparecendo aqui.
        </div>
        <button
          onClick={() => void doRefreshAll()}
          disabled={syncing}
          className="w-full rounded-xl border border-border py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {syncing ? "Atualizando…" : "Atualizar tudo agora"}
        </button>
      </div>

      {/* Admin: access log */}
      {isAdmin && (
        <div className={cardCls}>
          <div className={cardLabel}>Log de acesso</div>
          <div className="flex flex-col gap-2">
            {logs.map((l) => (
              <div key={l.log_id} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="shrink-0 font-mono text-[11px] text-muted">{formatTs(l.ts)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{userNameById(l.user_id)}</span>{" "}
                  <span className="text-muted">{l.action}</span>
                </span>
              </div>
            ))}
            {logs.length === 0 && <div className="py-2 text-center text-[13px] text-muted">—</div>}
          </div>
        </div>
      )}

      <button
        onClick={() => void signOut()}
        className="mt-1 w-full rounded-xl border border-danger py-3 text-[14px] font-bold text-danger"
      >
        Sair
      </button>

      {/* Selo de versão: é como saber, do lado de cá do telefone, se o aparelho já está rodando o
          que acabou de subir. Ver src/lib/version.ts. */}
      <div className="pb-2 pt-4 text-center font-mono text-[11px] text-muted">
        Toastrack {buildLabel()}
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full bg-text px-4 py-2 text-[13px] font-semibold text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
