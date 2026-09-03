/* Toastrack service worker — minimal offline app-shell cache.
 *
 * Strategy: network-first for navigations (so users get fresh HTML when online,
 * and the cached shell when offline), cache-first for same-origin static assets
 * (Next's hashed /_next/ files are immutable, so caching them is safe).
 *
 * Registered by src/components/ServiceWorkerRegister.tsx. Its scope is whatever
 * path it's served from (root in dev, /toastrack/ on GitHub Pages).
 */
const CACHE = "toastrack-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // don't touch Supabase / cross-origin

  // Rotas de API são dados vivos (itens, lookups, carimbo de sincronização) — NUNCA passam pelo
  // cache do service worker. Cachear aqui congelava o app numa foto dos dados: o carimbo de
  // SyncMeta era servido do cache e o cliente nunca via edição nenhuma (nem manual na planilha,
  // nem de outro aparelho). Deixa a chamada seguir direto pra rede.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, fall back to cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached || caches.match("./");
        }
      })()
    );
    return;
  }

  // Static assets: cache-first, populate cache on miss.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    })()
  );
});
