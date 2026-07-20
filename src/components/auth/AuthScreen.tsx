"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { validatePassword, logAccess } from "@/lib/auth";

type SubScreen = "login" | "signup" | "forgot";

const inputCls =
  "w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent";
const labelCls = "mb-1.5 mt-3.5 block text-[12.5px] font-semibold text-muted";
const primaryBtnCls =
  "mt-5 w-full rounded-xl bg-accent py-3 text-[14px] font-bold text-on-accent transition disabled:opacity-60";
const linkBtnCls = "text-[12.5px] font-bold text-accent";

const EYE_OPEN =
  "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z";
const EYE_OFF =
  "M3 3l18 18 M10.6 10.6a3 3 0 0 0 4.2 4.2 M9.9 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3-.5";

function resolvedBasePath(): string {
  return process.env.NEXT_PUBLIC_RESOLVED_BASE_PATH ?? "";
}

/**
 * Pre-auth UI: login / signup / forgot-password, wired to real Supabase Auth.
 * 2FA is deferred (see MEMORIA.md); the inactive-account screen is handled one
 * level up in AppShell (it's driven by the loaded profile's user_status).
 */
export default function AuthScreen() {
  const [screen, setScreen] = useState<SubScreen>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const supabase = getSupabaseClient();

  function goto(next: SubScreen) {
    setScreen(next);
    setError("");
    setNotice("");
    setPassword("");
  }

  async function doLogin() {
    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      // Give the unconfirmed-email case a helpful message; keep the rest generic
      // (don't reveal whether the account exists).
      setError(
        error.code === "email_not_confirmed"
          ? "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada)."
          : "E-mail ou senha inválidos.",
      );
      return;
    }
    // Session is set; AppShell takes over (and gates inactive accounts).
    void logAccess("login");
  }

  async function doSignup() {
    if (!name.trim() || !email) {
      setError("Informe nome e e-mail.");
      return;
    }
    if (!validatePassword(password)) {
      setError("Senha: mín. 8 caracteres, com maiúscula, minúscula, número e símbolo.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() } },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off — logged in immediately; AppShell takes over.
      void logAccess("signup");
      return;
    }
    // Email confirmation is on — account created, awaiting e-mail verification.
    setNotice("Conta criada. Confira seu e-mail para confirmar o cadastro antes de entrar.");
  }

  async function doForgot() {
    if (!email) {
      setError("Informe seu e-mail.");
      return;
    }
    setBusy(true);
    setError("");
    const redirectTo = `${window.location.origin}${resolvedBasePath()}/`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice("Enviamos um link de redefinição para seu e-mail.");
  }

  function onKeyDown(e: React.KeyboardEvent, action: () => void) {
    if (e.key === "Enter" && !busy) action();
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-7">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-1.5">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent-soft">
            <span className="size-5 rounded-full bg-accent" />
          </div>
          <div className="text-[22px] font-extrabold tracking-tight">Toastrack</div>
          <div className="text-[13px] text-muted">Seu aplicativo completo de Sommelieria</div>
        </div>

        {/* LOGIN */}
        {screen === "login" && (
          <>
            <div className="text-[18px] font-bold">Bem-vindo de volta</div>
            <div className="mb-1 text-[13px] text-muted">Entre para ver sua coleção.</div>

            <label className={labelCls}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => onKeyDown(e, doLogin)}
              placeholder="voce@email.com"
              className={inputCls}
            />

            <label className={labelCls}>Senha</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => onKeyDown(e, doLogin)}
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

            <div className="mt-3.5 flex justify-between">
              <button onClick={() => goto("forgot")} className={linkBtnCls}>Esqueci minha senha</button>
              <button onClick={() => goto("signup")} className={linkBtnCls}>Criar conta</button>
            </div>
          </>
        )}

        {/* SIGNUP */}
        {screen === "signup" && (
          <>
            <div className="text-[18px] font-bold">Crie sua conta</div>
            <div className="mb-1 text-[13px] text-muted">Comece a registrar suas degustações.</div>

            <label className={labelCls}>Nome de exibição</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Ana"
              className={inputCls}
            />

            <label className={labelCls}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className={inputCls}
            />

            <label className={labelCls}>Senha</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => onKeyDown(e, doSignup)}
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
            <div className="mt-1.5 text-[11.5px] text-muted">
              Mín. 8 caracteres, maiúscula, minúscula, número e símbolo.
            </div>

            {error && <div className="mt-3 text-[12.5px] font-semibold text-danger">{error}</div>}
            {notice && (
              <div className="mt-3 rounded-xl bg-accent-soft px-3 py-2.5 text-[12.5px] text-accent">{notice}</div>
            )}

            <button onClick={doSignup} disabled={busy} className={primaryBtnCls}>
              {busy ? "Criando…" : "Criar conta"}
            </button>

            <div className="mt-3.5 text-center">
              <button onClick={() => goto("login")} className={linkBtnCls}>Já tenho conta</button>
            </div>
          </>
        )}

        {/* FORGOT */}
        {screen === "forgot" && (
          <>
            <div className="text-[18px] font-bold">Esqueci minha senha</div>
            <div className="mb-1 text-[13px] text-muted">
              Enviaremos um link de redefinição para seu e-mail.
            </div>

            {notice && (
              <div className="mt-3 rounded-xl bg-accent-soft px-3 py-2.5 text-[12.5px] text-accent">{notice}</div>
            )}

            <label className={labelCls}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => onKeyDown(e, doForgot)}
              placeholder="voce@email.com"
              className={inputCls}
            />

            {error && <div className="mt-3 text-[12.5px] font-semibold text-danger">{error}</div>}

            <button onClick={doForgot} disabled={busy} className={primaryBtnCls}>
              {busy ? "Enviando…" : "Enviar link"}
            </button>

            <div className="mt-3.5 text-center">
              <button onClick={() => goto("login")} className={linkBtnCls}>Voltar ao login</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
