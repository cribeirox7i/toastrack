import type { NextConfig } from "next";

/**
 * Toastrack ships as a static export hosted on GitHub Pages (project page at
 * https://cribeirox7i.github.io/toastrack). GitHub Pages can't run the Next.js
 * server runtime, so every route is statically pre-rendered / client-rendered
 * and all data access happens client-side via the Supabase JS SDK.
 *
 * For a project page the site is served under the `/toastrack` sub-path, so we
 * set basePath/assetPrefix in production only (local `next dev` stays at root).
 * Override the repo/base path via NEXT_PUBLIC_BASE_PATH if the deploy target
 * changes (e.g. a custom domain or a user/org page served at root -> set it "").
 */
const isProd = process.env.NODE_ENV === "production";
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH ?? (isProd ? "/toastrack" : "");

const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages serves files as-is; Next's image optimizer needs a server, so disable it.
  images: { unoptimized: true },
  // Emit each route as a folder with index.html so GitHub Pages resolves deep links.
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // Expose the resolved base path to client code (e.g. service-worker scope, manifest links).
  env: { NEXT_PUBLIC_RESOLVED_BASE_PATH: basePath },
};

export default nextConfig;
