import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/session";

const NAV = [
  { href: "/admin/import", label: "Import & export" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="flex flex-wrap items-center gap-6 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <Link href="/" className="font-semibold">
          OfficeOrg
        </Link>
        <nav className="flex gap-4 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-neutral-500">{user.email}</span>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}
