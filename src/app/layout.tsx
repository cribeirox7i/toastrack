import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ThemeProvider from "@/components/ThemeProvider";
import AuthProvider from "@/components/AuthProvider";
import { DEFAULT_HUE, DEFAULT_MODE, THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

// Single typeface for the whole app (design token: Manrope 400/500/600/700/800).
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Base path is applied to static assets by next.config.ts; mirror it here so the
// manifest/icon links resolve under GitHub Pages' /toastrack/ sub-path too.
const base = process.env.NEXT_PUBLIC_RESOLVED_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Toastrack",
  description: "Seu aplicativo completo de Sommelieria",
  applicationName: "Toastrack",
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Toastrack",
  },
};

export const viewport: Viewport = {
  // Padrão = fundo do modo escuro (DEFAULT_MODE). ThemeProvider atualiza esta tag em tempo real
  // conforme o usuário troca claro/escuro, pra a barra de status do Android acompanhar o fundo.
  themeColor: "#171717",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-hue={DEFAULT_HUE}
      data-mode={DEFAULT_MODE}
      className={`${manrope.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply saved palette/mode before first paint to avoid a flash of the default theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden font-sans bg-bg text-text">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <ServiceWorkerRegister />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
