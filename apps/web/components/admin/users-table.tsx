"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeUserAccessAction } from "@/app/admin/users/actions";

export interface UsersTableRow {
  email: string;
  role: "viewer" | "admin";
  personName: string | null;
  disabled: boolean;
  // False when People marks them inactive or past their final date.
  personInGoodStanding: boolean;
  sessions: number;
  hasSignIn: boolean;
  lastSeen: string | null;
  // On ADMIN_EMAILS, so made admin again at every sign-in.
  bootstrapAdmin: boolean;
  // The admin looking at the page, who can't change their own access.
  self: boolean;
}

type Change =
  | { kind: "role"; role: UsersTableRow["role"] }
  | { kind: "disable" | "enable" | "end-sessions" | "reset-sign-in" };

function status(row: UsersTableRow): string {
  if (row.disabled) return "Disabled";
  if (!row.personInGoodStanding) return "Inactive in People";
  return "Active";
}

export function UsersTable({ rows }: { rows: UsersTableRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(email: string, change: Change) {
    startTransition(async () => {
      const result = await changeUserAccessAction(email, change);
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
    });
  }

  const button = "rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40";
  return (
    <div className="mt-6">
      {error ? (
        <p role="alert" className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
            <tr>
              <th className="py-2 pr-3 font-medium">User</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Last sign-in</th>
              <th className="py-2 pr-3 text-right font-medium">Sessions</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const locked = row.self || pending;
              return (
                <tr key={row.email} className="border-b border-border align-top">
                  <td className="py-2 pr-3">
                    <div>{row.email}</div>
                    {row.personName ? (
                      <div className="text-xs text-muted-fg">{row.personName}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={`Role for ${row.email}`}
                      className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
                      value={row.role}
                      disabled={locked || row.bootstrapAdmin}
                      onChange={(e) =>
                        apply(row.email, {
                          kind: "role",
                          role: e.target.value as UsersTableRow["role"],
                        })
                      }
                    >
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                    {row.bootstrapAdmin ? (
                      <div className="mt-1 text-xs text-muted-fg">On ADMIN_EMAILS</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{status(row)}</td>
                  <td className="py-2 pr-3 text-muted-fg">{row.lastSeen ?? "Never"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.sessions}</td>
                  <td className="py-2">
                    {row.self ? (
                      <span className="text-xs text-muted-fg">You</span>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.disabled ? (
                          <button
                            type="button"
                            className={button}
                            disabled={locked}
                            onClick={() => apply(row.email, { kind: "enable" })}
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`${button} text-destructive`}
                            disabled={locked}
                            onClick={() => apply(row.email, { kind: "disable" })}
                          >
                            Disable
                          </button>
                        )}
                        <button
                          type="button"
                          className={button}
                          disabled={locked || row.sessions === 0}
                          onClick={() => apply(row.email, { kind: "end-sessions" })}
                        >
                          End sessions
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={locked || !row.hasSignIn}
                          title="Forget how this user signed in, so their next sign-in starts fresh. Use it when their identity provider account was recreated."
                          onClick={() => {
                            if (
                              window.confirm(
                                `Reset sign-in for ${row.email}? Their sessions end and their next sign-in starts fresh.`,
                              )
                            )
                              apply(row.email, { kind: "reset-sign-in" });
                          }}
                        >
                          Reset sign-in
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
