import { GettingStarted } from "@/components/getting-started";
import { OrgView } from "@/components/org/org-view";
import { getDb } from "@orov/db/client";
import { loadDirectory } from "@orov/db/queries/directory";
import { regionFormatOf, requireUser } from "@/lib/session";

// The org chart builds both trees from the directory's data: fewer than 250 people, already
// loaded with their managers and teams, so it needs no query of its own.
export default async function OrgPage() {
  const user = await requireUser();
  const data = await loadDirectory(getDb(), regionFormatOf(user));
  if (data.people.length === 0) {
    return <GettingStarted title="Org chart" isAdmin={user.role === "admin"} />;
  }
  return <OrgView people={data.people} teams={data.teams} />;
}
