"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { validatePassword } from "@/lib/auth";

const inputCls =
  "w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent";
const labelCls = "mb-1.5 mt-3.5 block text-[12.5px] font-semibold text-muted";
const primaryBtnCls =
  "mt-5 w-full rounded-xl bg-accent py-3 text-[14px] font-bold text-on-accent transition disabled:opacity-60";

/**
 * Bloqueia o resto do app até a pessoa trocar a senha provisória — vale tanto pra quem acabou de
 * ser criado quanto pra quem teve a senha resetada por um admin (`deve_trocar_senha`, ver
 * MIGRACAO_SHEETS.md seção 4.1). Chama `update()` do NextAuth ao final pra sessão JWT refletir a
 * mudança sem precisar de logout/login (ver TODO em src/auth.ts).
 */
export default function TrocarSenhaObrigatoria({ onDone }: { onDone: () => void }) {
  const { update } = useSession();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    if (!senhaAtual || !senhaNova) {
      setError("Preencha os campos.");
      return;
    }
    if (!validatePassword(senhaNova)) {
      setError("Nova senha: mín. 8 caracteres, com maiúscula, minúscula, número e símbolo.");
      return;
    }
    if (senhaNova !== confirmar) {
      setError("A confirmação não confere.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/profile/senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senhaAtual, senhaNova }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erro ao trocar a senha.");
      return;
    }
    await update({ deveTrocarSenha: false });
    onDone();
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-7">
        <div className="text-[18px] font-bold">Troca de senha obrigatória</div>
        <p className="mb-1 text-[13px] text-muted">
          Sua senha é provisória — defina uma nova antes de continuar.
        </p>

        <label className={labelCls}>Senha atual (provisória)</label>
        <input
          type="password"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
          className={inputCls}
        />

        <label className={labelCls}>Nova senha</label>
        <input
          type="password"
          value={senhaNova}
          onChange={(e) => setSenhaNova(e.target.value)}
          className={inputCls}
        />
        <div className="mt-1.5 text-[11.5px] text-muted">
          Mín. 8 caracteres, maiúscula, minúscula, número e símbolo.
        </div>

        <label className={labelCls}>Confirmar nova senha</label>
        <input
          type="password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && void submit()}
          className={inputCls}
        />

        {error && <div className="mt-3 text-[12.5px] font-semibold text-danger">{error}</div>}

        <button onClick={submit} disabled={busy} className={primaryBtnCls}>
          {busy ? "Trocando…" : "Trocar senha e entrar"}
        </button>
      </div>
    </div>
  );
}
