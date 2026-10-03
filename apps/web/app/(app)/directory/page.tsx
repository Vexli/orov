import { DirectoryView } from "@/components/directory/directory-view";
import { getDb } from "@officeorg/db/client";
import { loadDirectory } from "@officeorg/db/queries/directory";
import { requireUser } from "@/lib/session";

export default async function DirectoryPage() {
  const user = await requireUser();
  const data = await loadDirectory(getDb(), user.regionDisplay);
  return <DirectoryView people={data.people} teams={data.teams} locations={data.locations} />;
}
