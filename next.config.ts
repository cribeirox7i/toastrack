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

// Origens externas usadas no cliente (não inclui chamadas server-only como Gemini/Apps Script).
// lh3.googleusercontent.com: fotos do Drive (img src gerado por driveUploadFile).
// flagcdn.com: SVGs de bandeira de país (src/lib/flags.ts).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://lh3.googleusercontent.com https://flagcdn.com",
  // Next.js App Router injeta scripts inline de hidratação — sem nonce explícito, unsafe-inline
  // é necessário. Ainda assim bloqueia scripts de origens externas não listadas.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  // pdf.js usa new URL('pdfjs-dist/…worker…', import.meta.url): Next.js empacota em /_next/static/
  // (mesma origem). blob: cobre fallback em browsers que criam worker via blob URL.
  "worker-src 'self' blob:",
  "font-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  /**
   * Selo de versão do rodapé do Perfil (ver src/lib/version.ts). São lidas no build e embutidas
   * no bundle do cliente - `VERCEL_GIT_COMMIT_SHA` é preenchida pelo Vercel a cada deploy e não
   * existe em dev, daí o "local".
   */
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
