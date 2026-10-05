import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { TimeZoneCookie } from "@/components/time-zone-cookie";
import { brandAssetUrl, getBrand } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: brand.appName,
    description: "People, seats, teams and presence for our offices",
    icons: brand.favicon ? { icon: brandAssetUrl(brand.favicon) } : undefined,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();
  return (
    <html lang="en">
      <head>
        {/* The active theme (plan.md §9.1). globals.css bundles the defaults in a cascade layer,
            so this unlayered stylesheet wins wherever it loads in the page. */}
        <link rel="stylesheet" href={brand.cssHref} precedence="orov-theme" />
      </head>
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <NuqsAdapter>{children}</NuqsAdapter>
        <TimeZoneCookie />
      </body>
    </html>
  );
}
