import { DirectoryView } from "@/components/directory/directory-view";
import { GettingStarted } from "@/components/getting-started";
import { getDb } from "@orov/db/client";
import { loadDirectory } from "@orov/db/queries/directory";
import { regionFormatOf, requireUser } from "@/lib/session";

export default async function DirectoryPage() {
  const user = await requireUser();
  const data = await loadDirectory(getDb(), regionFormatOf(user));
  if (data.people.length === 0) {
    return <GettingStarted title="Directory" isAdmin={user.role === "admin"} />;
  }
  return <DirectoryView people={data.people} teams={data.teams} locations={data.locations} />;
}
