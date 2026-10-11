import type { NextConfig } from "next";

// Sent with every response. The CSP is the base policy (BASE_CSP in @orov/core/security/csp): no
// framing by another origin (admin actions can't be clickjacked), no <base> or plugin injection.
// Same-origin frames stay allowed: the Branding page previews a draft theme in one. proxy.ts
// replaces it on pages with one that adds a nonce-based script-src; /api/brand-assets/* sets its
// own sandboxing CSP.
// HSTS is ignored by browsers over plain HTTP, so local development is unaffected.
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // The workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@orov/db", "@orov/core"],
  // Keep the Postgres driver out of the client bundle. jsdom (used to sanitize floor drawings)
  // reads its own files at runtime, so it has to load through Node rather than the bundler.
  serverExternalPackages: ["pg", "jsdom"],
  experimental: {
    // Floor drawings are capped at 2 MB (packages/core/svg/sanitize.ts), and the action payload
    // adds some encoding on top. CSV imports are well under this. Next's default is 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
