import { formatDateTime, isBootstrapAdmin } from "@orov/core";
import { getDb } from "@orov/db/client";
import { listAppUsers } from "@orov/db/queries/app-users";
import { UsersTable, type UsersTableRow } from "@/components/admin/users-table";
import { requireAdmin } from "@/lib/session";

// Everyone who has signed in, and the controls that take access away (Phase 9).
export default async function UsersAdminPage() {
  const user = await requireAdmin();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",");
  const rows: UsersTableRow[] = (await listAppUsers(getDb())).map((row) => ({
    email: row.email,
    role: row.role,
    personName: row.personName,
    disabled: row.disabledAt !== null,
    personInGoodStanding: row.personInGoodStanding,
    sessions: row.sessions,
    hasSignIn: row.hasSignIn,
    lastSeen: row.lastSeenAt
      ? formatDateTime(row.lastSeenAt, user.dateFormat, user.timeZone, { zone: true })
      : null,
    bootstrapAdmin: isBootstrapAdmin(row.email, adminEmails),
    self: row.email === user.email,
  }));

  return (
    <div>
      <h1 className="text-xl font-heading">Users</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-fg">
        Everyone who has signed in. Disabling someone ends their sessions and keeps them out until
        you enable them again. Someone marked inactive, or past their final date, in People loses
        access the same way. Their identity provider still decides who can sign in at all.
      </p>
      <UsersTable rows={rows} />
    </div>
  );
}
