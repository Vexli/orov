import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@officeorg/db", "@officeorg/core"],
  // Keep the Postgres driver out of the client bundle.
  serverExternalPackages: ["pg"],
  experimental: {
    // A few thousand rows of CSV is well under this. Next's default is 1 MB.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
