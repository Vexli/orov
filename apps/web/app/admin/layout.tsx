import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/session";

const NAV = [
  { href: "/admin/people", label: "People" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/import", label: "Import & export" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="flex flex-wrap items-center gap-6 border-b border-border pb-4">
        <Link href="/" className="font-semibold">
          OfficeOrg
        </Link>
        <nav className="flex gap-4 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-muted-fg hover:text-fg">
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-muted-fg">{user.email}</span>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}
