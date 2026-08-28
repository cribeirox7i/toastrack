import type { NextConfig } from "next";

/**
 * Toastrack roda no Vercel (Next.js server runtime) — migração de GitHub Pages/static export
 * pra Sheets/Drive (ver MIGRACAO_SHEETS.md), motivada por precisar de rotas de API server-only
 * pra falar com o Apps Script sem expor o SHARED_SECRET ao navegador.
 *
 * `output: "export"`, `basePath`/`assetPrefix` (sub-path `/toastrack` do GitHub Pages Project
 * Page) e `images.unoptimized` saíram todos daqui: nenhum deles faz sentido servindo do domínio
 * raiz de um app com servidor. `NEXT_PUBLIC_RESOLVED_BASE_PATH` também sumiu — os 3 lugares que
 * liam essa env var (AuthScreen, layout, ServiceWorkerRegister) já caem em "" quando ela não
 * existe, então o comportamento continua correto sem precisar declará-la aqui.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
