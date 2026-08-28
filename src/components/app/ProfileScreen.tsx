"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { PALETTES, HUES, hueToPaletteEnum, type HueName } from "@/lib/theme";
import { initialsFor } from "@/lib/utils";
import { validatePassword } from "@/lib/auth";
import { saveUserPrefs, changePassword } from "@/lib/prefs";
import {
  fetchAllUsers,
  setUserStatus,
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

  const [toast, setToast] = useState("");
  function showToast(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(""), 2200);
  }

  // ---- Admin ----
  const isAdmin = appUser?.user_role === "admin";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

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
        <div className="flex size-[72px] items-center justify-center rounded-full bg-accent-soft text-[26px] font-extrabold text-accent">
          {initialsFor(name || email)}
        </div>
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
                  background: `oklch(58% 0.13 ${HUES[p.name]})`,
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
          <div className="flex flex-col gap-1">
            {users.map((u) => (
              <div key={u.user_id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{u.user_nome}</div>
                  <div className="truncate text-[11.5px] text-muted">{u.user_mail}</div>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                  style={{
                    background: u.user_status === "S" ? "var(--accent-soft)" : "var(--track)",
                    color: u.user_status === "S" ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {u.user_status === "S" ? "ativo" : "inativo"}
                </span>
                <button
                  onClick={() => toggleStatus(u)}
                  className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-bold text-muted"
                >
                  {u.user_status === "S" ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
            {users.length === 0 && <div className="py-2 text-center text-[13px] text-muted">—</div>}
          </div>
        </div>
      )}

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

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full bg-text px-4 py-2 text-[13px] font-semibold text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
