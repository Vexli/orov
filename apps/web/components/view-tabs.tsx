"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VIEWS = [
  { href: "/directory", label: "Directory" },
  { href: "/map", label: "Map" },
  { href: "/org", label: "Org chart" },
];

// The view tabs in the shell. Keeping the selection across a switch is Phase 3 (plan.md §7).
export function ViewTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Views" className="flex gap-4 text-sm">
      {VIEWS.map((view) => {
        const active = pathname === view.href || pathname.startsWith(`${view.href}/`);
        return (
          <Link
            key={view.href}
            href={view.href}
            aria-current={active ? "page" : undefined}
            className={
              active ? "font-medium underline underline-offset-4" : "text-muted-fg hover:text-fg"
            }
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
