"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";

const inputCls =
  "w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent";
const labelCls = "mb-1.5 mt-3.5 block text-[12.5px] font-semibold text-muted";
const primaryBtnCls =
  "mt-5 w-full rounded-xl bg-accent py-3 text-[14px] font-bold text-on-accent transition disabled:opacity-60";

const EYE_OPEN =
  "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z";
const EYE_OFF =
  "M3 3l18 18 M10.6 10.6a3 3 0 0 0 4.2 4.2 M9.9 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3-.5";

/**
 * Pré-auth: só login. Sem cadastro público nem "esqueci minha senha" — decisão da migração
 * (MIGRACAO_SHEETS.md seção 8): só admin cria usuário (senha provisória), e reset de senha hoje
 * é só pelo admin (`/api/admin/users/[id]/reset-senha`) até existir um fluxo de e-mail próprio.
 * A tela de conta inativa é resolvida um nível acima em AppShell.
 */
export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { update } = useSession();

  async function doLogin() {
    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await signIn("credentials", { email, senha: password, redirect: false });
    if (res?.error) {
      setBusy(false);
      setError("E-mail ou senha inválidos.");
      return;
    }
    // signIn(redirect:false) grava o cookie, mas o SessionProvider não refaz o fetch sozinho
    // (mesmo motivo do update() em TrocarSenhaObrigatoria) — sem isso a tela ficava presa no
    // login até um F5 manual, mesmo com a sessão já válida no servidor.
    await update();
    setBusy(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !busy) void doLogin();
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex flex-col items-center gap-1.5">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent-soft">
            <span className="size-5 rounded-full bg-accent" />
          </div>
          <div className="text-[22px] font-extrabold tracking-tight">Toastrack</div>
          <div className="text-[13px] text-muted">Seu aplicativo completo de Sommelieria</div>
        </div>

        <div className="text-[18px] font-bold">Bem-vindo de volta</div>
        <div className="mb-1 text-[13px] text-muted">Entre para ver sua coleção.</div>

        <label className={labelCls}>E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="voce@email.com"
          className={inputCls}
        />

        <label className={labelCls}>Senha</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="••••••••"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={showPassword ? EYE_OFF : EYE_OPEN} />
            </svg>
          </button>
        </div>

        {error && <div className="mt-3 text-[12.5px] font-semibold text-danger">{error}</div>}

        <button onClick={doLogin} disabled={busy} className={primaryBtnCls}>
          {busy ? "Entrando…" : "Entrar"}
        </button>

        <div className="mt-3.5 text-center text-[12.5px] text-muted">
          Esqueceu a senha ou precisa de uma conta? Fale com o administrador.
        </div>
      </div>
    </div>
  );
}
