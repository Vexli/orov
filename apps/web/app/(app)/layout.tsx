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
    // The window never scrolls: the main menu keeps its row (N3) and <main> scrolls under it, so the
    // map and org chart can fill exactly the height that's left (Phase 8).
    <div className="flex h-dvh flex-col">
      {/* On wide screens the main menu is one 3.5rem row; FloatingPanel's offsets assume it. */}
      <header className="z-30 shrink-0 border-b border-border bg-bg">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-6 lg:h-14 lg:flex-nowrap lg:py-0">
          <Link href="/directory">
            <BrandMark brand={brand} />
          </Link>
          <ViewTabs />
          <CommandPalette />
          {/* On narrow screens the account links fold into a menu, so the main menu is one row
              and leaves the screen to the view (Phase 6). */}
          <div className="ml-auto hidden items-center gap-4 text-sm text-muted-fg lg:flex">
            <AccountLinks isAdmin={user.role === "admin"} />
            <span>{user.email}</span>
            <SignOut />
          </div>
          <details className="relative ml-auto text-sm lg:hidden">
            <summary className="flex cursor-pointer list-none items-center rounded-md border border-border px-2 py-1 text-muted-fg hover:text-fg sm:px-3 [&::-webkit-details-marker]:hidden">
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="size-4 py-px sm:hidden"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
              >
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              </svg>
              <span className="sr-only sm:not-sr-only">Menu</span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 flex w-56 flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-fg shadow-lg">
              <span className="truncate text-xs text-muted-fg">{user.email}</span>
              <AccountLinks isAdmin={user.role === "admin"} />
              <SignOut />
            </div>
          </details>
        </div>
      </header>
      {/* Views use the whole width (N2); pages that read better narrow, such as Settings, set
          their own width. A flex column, so a view can give its content the remaining height
          with flex-1; pages taller than the screen scroll here. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">{children}</main>
    </div>
  );
}

function AccountLinks({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      {isAdmin ? (
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
    </>
  );
}

function SignOut() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="underline underline-offset-4">
        Sign out
      </button>
    </form>
  );
}
