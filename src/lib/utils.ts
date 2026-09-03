/**
 * Acrescenta um parâmetro único a uma URL de API, pra nenhum service worker antigo conseguir
 * casá-la no cache dele.
 *
 * `cache: "no-store"` instrui só o cache HTTP do navegador — não tem efeito nenhum sobre um
 * service worker que responda `caches.match(request)`, que casa por URL. Uma versão antiga do
 * nosso SW (até `toastrack-v1`) fazia exatamente isso com as rotas `/api/`, e um SW já instalado
 * continua controlando a página mesmo depois de um deploy novo — o app ficava servindo uma foto
 * congelada dos dados por tempo indeterminado (ver public/sw.js e ServiceWorkerRegister.tsx).
 */
export function noCacheUrl(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Initials for an avatar: first letter of up to the first two words, uppercased.
 *  Mirrors the prototype's initialsFor(). "Carlos Ribeiro" -> "CR", "Ana" -> "A". */
export function initialsFor(name: string | null | undefined): string {
  return (
    (name || "?")
      .replace(/[^\p{L}\s]/gu, "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
