import type { NextConfig } from "next";

const receiptFonts = ["./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-*-normal.woff"];

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files; keep it (and the Postgres driver) out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Receipt images read their font files at runtime; make sure deploys ship them with the functions.
  outputFileTracingIncludes: {
    "/api/receipt/[id]/image": receiptFonts,
    "/receipt/[id]/opengraph-image": receiptFonts,
    // Migrations are read from disk on boot.
    "/**": ["./src/db/migrations/*.sql"],
  },
  poweredByHeader: false,
  // Types are checked in CI (`npm run typecheck`); never block a deploy on them.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
