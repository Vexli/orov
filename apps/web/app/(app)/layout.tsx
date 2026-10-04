import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";
import { CommandPalette } from "@/components/search/command-palette";
import { BrandMark } from "@/components/brand-mark";
import { ViewTabs } from "@/components/view-tabs";
import { requireUser } from "@/lib/session";
import { getBrand } from "@/lib/theme";

// Shell for the signed-in views. The admin area has its own layout.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, brand] = await Promise.all([requireUser(), getBrand()]);
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/directory">
            <BrandMark brand={brand} />
          </Link>
          <ViewTabs />
          <CommandPalette />
          <div className="ml-auto flex items-center gap-4 text-sm text-muted-fg">
            {user.role === "admin" ? (
              <Link href="/admin" className="underline underline-offset-4">
                Admin
              </Link>
            ) : null}
            <Link href="/profile" className="underline underline-offset-4">
              My profile
            </Link>
            <Link href="/settings" className="underline underline-offset-4">
              Settings
            </Link>
            <span className="hidden sm:inline">{user.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="underline underline-offset-4">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
