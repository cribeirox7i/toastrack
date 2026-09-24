"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import Icon from "@/components/Icon";
import { isBiometricLockEnabled, verifyBiometric } from "@/lib/biometricLock";

/**
 * Trava a TELA (não a sessão) quando o Carlos ativou o bloqueio por biometria no Perfil - ver
 * biometricLock.ts pro porquê disso não fazer round-trip de servidor.
 *
 * `useLayoutEffect` (não `useEffect`) pra decidir se começa trancado: roda antes do navegador
 * pintar o frame, então o app nunca aparece "destrancado" por um instante antes da tela de
 * bloqueio entrar - nem no load frio nem ao voltar de segundo plano.
 *
 * `children` continuam montados por baixo da tela de bloqueio (nunca desmontam) - trocar de app
 * rapidinho não perde rascunho de formulário nem estado de navegação; a tela de bloqueio é só uma
 * camada opaca por cima (`fixed inset-0`), igual um cadeado físico.
 */
export default function BiometricLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    setLocked(isBiometricLockEnabled());
  }, []);

  useLayoutEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden" && isBiometricLockEnabled()) {
        setLocked(true);
        setError("");
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  async function tryUnlock() {
    setChecking(true);
    setError("");
    const ok = await verifyBiometric();
    setChecking(false);
    if (ok) setLocked(false);
    else setError("Não foi possível confirmar. Toque para tentar de novo.");
  }

  return (
    <>
      {children}
      {locked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg px-8">
          <div className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="fingerprint" size={30} />
          </div>
          <div className="text-center">
            <div className="text-[16px] font-bold">Toastrack travado</div>
            <div className="mt-1 text-[13px] text-muted">Confirme sua biometria pra continuar</div>
          </div>
          <button
            onClick={() => void tryUnlock()}
            disabled={checking}
            className="w-full max-w-[220px] rounded-xl bg-accent py-3 text-[14px] font-bold text-on-accent disabled:opacity-60"
          >
            {checking ? "Confirmando…" : "Desbloquear"}
          </button>
          {error && <div className="text-center text-[12.5px] font-semibold text-danger">{error}</div>}
        </div>
      )}
    </>
  );
}
