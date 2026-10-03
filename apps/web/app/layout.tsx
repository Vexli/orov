import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfficeOrg",
  description: "People, seats, teams and presence for our offices",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
