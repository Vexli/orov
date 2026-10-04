import { DirectoryView } from "@/components/directory/directory-view";
import { getDb } from "@officeorg/db/client";
import { loadDirectory } from "@officeorg/db/queries/directory";
import { regionFormatOf, requireUser } from "@/lib/session";

export default async function DirectoryPage() {
  const user = await requireUser();
  const data = await loadDirectory(getDb(), regionFormatOf(user));
  return <DirectoryView people={data.people} teams={data.teams} locations={data.locations} />;
}
