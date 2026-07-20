"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) once, on the client, after load.
 * Uses the resolved base path so the SW scope is correct both in local dev
 * (root) and on GitHub Pages (/toastrack/). Skipped in development to avoid the
 * SW caching stale dev assets during hot reload.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const base = process.env.NEXT_PUBLIC_RESOLVED_BASE_PATH ?? "";
    const swUrl = `${base}/sw.js`;
    const scope = `${base}/`;

    const register = () => {
      navigator.serviceWorker.register(swUrl, { scope }).catch((err) => {
        console.error("Toastrack service worker registration failed:", err);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
