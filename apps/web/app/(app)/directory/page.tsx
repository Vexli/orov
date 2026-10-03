import { DirectoryView } from "@/components/directory/directory-view";
import { getDb } from "@officeorg/db/client";
import { loadDirectory } from "@officeorg/db/queries/directory";

export default async function DirectoryPage() {
  const data = await loadDirectory(getDb());
  return <DirectoryView people={data.people} teams={data.teams} locations={data.locations} />;
}
