"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) once, on the client, after load.
 * Uses the resolved base path so the SW scope is correct both in local dev
 * (root) and on GitHub Pages (/toastrack/). Skipped in development to avoid the
 * SW caching stale dev assets during hot reload.
 *
 * Força uma checagem de atualização a cada abertura do app e recarrega a página assim que um
 * service worker novo assume: um SW já instalado continua controlando a página depois de um
 * deploy, então o app podia ficar rodando com JS novo mas SW velho por tempo indeterminado — foi
 * o que manteve as rotas `/api/` sendo servidas de um cache congelado depois da correção do
 * `toastrack-v1` (ver public/sw.js).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const base = process.env.NEXT_PUBLIC_RESOLVED_BASE_PATH ?? "";
    const swUrl = `${base}/sw.js`;
    const scope = `${base}/`;

    // Só recarrega quando um SW SUBSTITUI outro. Na primeira instalação (sem controlador antes)
    // `controllerchange` também dispara, e recarregar ali seria um refresh gratuito na cara do
    // usuário.
    const tinhaControlador = !!navigator.serviceWorker.controller;
    let recarregando = false;
    const onControllerChange = () => {
      if (!tinhaControlador || recarregando) return;
      recarregando = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      navigator.serviceWorker
        .register(swUrl, { scope })
        // `update()` pede ao navegador pra reconferir o sw.js agora, sem esperar a checagem
        // automática dele. Com o `skipWaiting()` do nosso SW, uma versão nova assume na hora.
        .then((reg) => reg.update())
        .catch((err) => {
          console.error("Toastrack service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
