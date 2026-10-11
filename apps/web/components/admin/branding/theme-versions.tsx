"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { activateThemeAction } from "@/app/admin/branding/actions";

interface Version {
  id: string;
  version: number;
  active: boolean;
  createdBy: string;
  // Formatted on the server in the viewer's date format and time zone (#27).
  createdLabel: string;
}

// Every applied theme, with rollback and a return to the deploy-time default (plan.md §9.1).
// Rolling back switches the active version; it doesn't add one.
export function ThemeVersions({ versions }: { versions: Version[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const anyActive = versions.some((v) => v.active);

  function activate(id: string | null, label: string) {
    setError(null);
    start(async () => {
      const result = await activateThemeAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/branding?activated=${encodeURIComponent(label)}`);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="versions-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <h2 id="versions-heading" className="font-heading">
          Versions
        </h2>
        <a href="/api/export/theme" download className="text-sm underline">
          Export the current theme (DTCG JSON)
        </a>
        {anyActive ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => activate(null, "default")}
            className="text-sm underline"
          >
            Use the default theme
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {versions.length === 0 ? (
        <p className="text-sm text-muted-fg">No theme applied yet. The default theme is in use.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
            <tr>
              <th className="py-2 pr-3 font-medium">Version</th>
              <th className="py-2 pr-3 font-medium">Applied</th>
              <th className="py-2 pr-3 font-medium">By</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-b border-border">
                <td className="py-2 pr-3 tabular-nums">
                  {v.version}{" "}
                  {v.active ? (
                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                      current
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3">{v.createdLabel}</td>
                <td className="py-2 pr-3">{v.createdBy}</td>
                <td className="py-2 text-right">
                  {v.active ? null : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => activate(v.id, `version ${v.version}`)}
                      className="underline"
                    >
                      Roll back to version {v.version}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
