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
      {/* The main menu stays at the top (N3). On wide screens it's one 3.5rem row, so a view's
          own bar (ViewBar) can stick right under it. */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 lg:h-14 lg:flex-nowrap lg:py-0">
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
      {/* Views use the whole width (N2); pages that read better narrow, such as Settings, set
          their own width. */}
      <main className="px-4 py-6">{children}</main>
    </div>
  );
}
