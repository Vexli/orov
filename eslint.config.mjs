import js from "@eslint/js";
import nextConfig from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "packages/db/migrations/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextConfig,
  {
    settings: {
      // React is installed in apps/web only, so the root config can't detect its version.
      react: { version: "19" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // App Router only. There is no pages/ directory to link to.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
);
