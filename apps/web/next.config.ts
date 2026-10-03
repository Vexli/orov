import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@officeorg/db", "@officeorg/core"],
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
