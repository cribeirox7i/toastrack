"use client";

import { useEffect, useState } from "react";
import { photoUploadEvents, type PhotoUploadEventDetail } from "@/lib/photoUpload";

/**
 * Único jeito de o usuário saber se uma foto que subiu em segundo plano deu certo ou não - desde
 * 2026-09-03 o upload começa no Salvar e a tela volta pra lista na hora, sem esperar por ele (ver
 * `queuePhotoUpload`), então o toast local de DetailScreen já não existe mais quando o resultado
 * chega. Fica montado no shell (MainApp), que nunca desmonta entre telas.
 *
 * Sucesso some sozinho; ERRO fica até o toque (2026-09-09: um toast de 3s se perdia quando o
 * Carlos não estava olhando a tela, e a foto sumia sem ele saber).
 */
export default function GlobalPhotoToast() {
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState(false);

  useEffect(() => {
    function onDone(e: Event) {
      const { result } = (e as CustomEvent<PhotoUploadEventDetail>).detail;
      if (result.ok) {
        setErro(false);
        setMsg("Foto enviada");
        window.setTimeout(() => setMsg(""), 3200);
      } else {
        setErro(true);
        setMsg(result.error ?? "Erro ao enviar a foto");
      }
    }
    photoUploadEvents.addEventListener("done", onDone);
    return () => photoUploadEvents.removeEventListener("done", onDone);
  }, []);

  if (!msg) return null;
  return (
    <button
      onClick={() => setMsg("")}
      className="fixed bottom-8 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-2xl px-4 py-2 text-[13px] font-semibold shadow-lg"
      style={{
        background: erro ? "var(--danger)" : "var(--text)",
        color: erro ? "#fff" : "var(--bg)",
      }}
    >
      {msg}
      {erro && <span className="ml-1 opacity-80">· toque pra fechar</span>}
    </button>
  );
}
