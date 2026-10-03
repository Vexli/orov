import { sql } from "drizzle-orm";
import type { PersonRecord } from "@officeorg/core";
import type { Executor } from "../client";

// True if walking up the manager chain from `personId` returns to `personId`.
// UNION rather than UNION ALL stops the walk even if the existing data already contains a cycle.
export async function hasManagerCycle(db: Executor, personId: string): Promise<boolean> {
  const result = await db.execute(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT manager_id FROM person WHERE id = ${personId}
      UNION
      SELECT p.manager_id FROM person p JOIN chain c ON p.id = c.id WHERE c.id IS NOT NULL
    )
    SELECT 1 AS found FROM chain WHERE id = ${personId}
  `);
  return result.rows.length > 0;
}

// Loads everyone in the spreadsheet vocabulary: references by email, slug and desk code.
export async function loadPersonRecords(db: Executor): Promise<PersonRecord[]> {
  const rows = await db.query.person.findMany({
    with: {
      manager: { columns: { email: true } },
      assignedDesk: { columns: { name: true } },
      teamMembers: { with: { team: { columns: { slug: true } } } },
    },
    orderBy: (p, { asc }) => [asc(p.email)],
  });

  return rows.map((row) => ({
    email: row.email,
    name: row.name,
    preferredName: row.preferredName,
    title: row.title,
    phone: row.phone,
    homeCountry: row.homeCountry,
    homeTimezone: row.homeTimezone,
    startDate: row.startDate,
    active: row.active,
    managerEmail: row.manager?.email ?? null,
    deskCode: row.assignedDesk?.name ?? null,
    teamSlugs: row.teamMembers.map((m) => m.team.slug).sort(),
    primaryTeamSlug: row.teamMembers.find((m) => m.isPrimary)?.team.slug ?? null,
  }));
}
