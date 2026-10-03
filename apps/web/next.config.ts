import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@officeorg/db", "@officeorg/core"],
  output: "standalone",
  // Keep the Postgres driver out of the client bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
