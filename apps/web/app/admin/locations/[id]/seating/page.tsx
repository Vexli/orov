import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@officeorg/db/client";
import { getLocation } from "@officeorg/db/queries/floors";
import { loadSeatingInput } from "@officeorg/db/queries/seating";
import { SeatingPlanner } from "@/components/admin/seating-planner";

// The seating planner (N10): seat each team together in one office, keeping locked people put.
export default async function SeatingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const location = await getLocation(db, id);
  if (!location) notFound();
  const input = await loadSeatingInput(db, id);

  return (
    <div className="max-w-4xl">
      <Link href={`/admin/locations/${id}`} className="text-sm text-muted-fg underline">
        {location.name}
      </Link>
      <h1 className="mt-1 text-xl font-heading">Plan seating</h1>
      <p className="mt-1 text-sm text-muted-fg">
        Rearranges the {input.people.length} people sitting in {location.name} so each team sits together, using
        its {input.desks.length} desks. Lock anyone who should stay where they are; their team gathers around them.
        You&apos;ll see every move before anything changes.
      </p>
      <SeatingPlanner
        locationId={id}
        people={input.people
          .map((p) => ({ id: p.id, name: p.name, teamName: p.teamName }))
          .sort((a, b) => (a.teamName ?? "~").localeCompare(b.teamName ?? "~") || a.name.localeCompare(b.name))}
      />
    </div>
  );
}
