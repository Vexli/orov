import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";
import { requireUser } from "@/lib/session";

// Shell for the signed-in views. The admin area has its own layout.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/directory" className="font-semibold">
            OfficeOrg
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/directory" className="font-medium underline underline-offset-4">
              Directory
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm text-muted-fg">
            {user.role === "admin" ? (
              <Link href="/admin" className="underline underline-offset-4">
                Admin
              </Link>
            ) : null}
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
