"use client";

import { useEffect, useState } from "react";
import { photoUploadEvents, type PhotoUploadEventDetail } from "@/lib/photoUpload";

/**
 * Único jeito de o usuário saber se uma foto que subiu em segundo plano deu certo ou não - desde
 * 2026-09-03 o upload começa no Salvar e a tela volta pra lista na hora, sem esperar por ele (ver
 * `queuePhotoUpload`), então o toast local de DetailScreen já não existe mais quando o resultado
 * chega. Fica montado no shell (MainApp), que nunca desmonta entre telas.
 */
export default function GlobalPhotoToast() {
  const [msg, setMsg] = useState("");

  useEffect(() => {
    function onDone(e: Event) {
      const { result } = (e as CustomEvent<PhotoUploadEventDetail>).detail;
      setMsg(result.ok ? "Foto enviada" : (result.error ?? "Erro ao enviar a foto"));
      window.setTimeout(() => setMsg(""), 3200);
    }
    photoUploadEvents.addEventListener("done", onDone);
    return () => photoUploadEvents.removeEventListener("done", onDone);
  }, []);

  if (!msg) return null;
  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-text px-4 py-2 text-[13px] font-semibold text-bg shadow-lg">
      {msg}
    </div>
  );
}
