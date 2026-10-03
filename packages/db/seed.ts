import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "./client";
import { resetDatabase } from "./reset";
import * as s from "./schema";

// Demo data for local development and the Playwright suite. The people and teams match the
// seed described in plan.md §11: Bob → Max → Jane, HR with two sub-teams, Jane based in CA
// with a desk in SF, a South Wing area, and rooms in several states.
//
// Ids are fixed so URLs in tests and docs stay readable (for example ?person=p_bob).

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
  <g id="area-south-wing"><rect id="desk-2-003" x="40" y="40" width="40" height="30"/></g>
  <rect id="desk-2-010" x="120" y="40" width="40" height="30"/>
  <rect id="desk-2-014" x="200" y="40" width="40" height="30"/>
  <rect id="desk-2-016" x="280" y="40" width="40" height="30"/>
  <rect id="room-boardroom" x="40" y="200" width="200" height="120"/>
  <rect id="room-huddle-a" x="280" y="200" width="120" height="80"/>
  <rect id="room-phone-1" x="440" y="200" width="60" height="60"/>
  <rect id="poi-kitchen" x="560" y="200" width="100" height="100"/>
</svg>`;

export async function seedDemoData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(s.location).values({
      id: "loc_sf",
      slug: "sf",
      name: "San Francisco",
      timezone: "America/Los_Angeles",
      country: "US",
      sortOrder: 1,
    });

    // svgAssetId is set after the asset exists, because the two tables reference each other.
    await tx.insert(s.floor).values({
      id: "fl_sf_2",
      locationId: "loc_sf",
      slug: "2",
      name: "Floor 2",
      level: 2,
      sortOrder: 2,
    });
    await tx.insert(s.svgAsset).values({
      id: "svg_sf_2_v1",
      floorId: "fl_sf_2",
      version: 1,
      sanitizedSvg: SVG,
      sha256: createHash("sha256").update(SVG).digest("hex"),
      uploadedBy: "seed",
    });
    await tx.update(s.floor).set({ svgAssetId: "svg_sf_2_v1" }).where(eq(s.floor.id, "fl_sf_2"));

    await tx.insert(s.area).values({
      id: "area_south_wing",
      floorId: "fl_sf_2",
      slug: "south-wing",
      name: "South Wing",
      svgElementId: "area-south-wing",
    });

    await tx.insert(s.space).values([
      desk("sp_sf_2_003", "SF-2-003", "desk-2-003", "area_south_wing"),
      desk("sp_sf_2_010", "SF-2-010", "desk-2-010", null),
      desk("sp_sf_2_014", "SF-2-014", "desk-2-014", null),
      desk("sp_sf_2_016", "SF-2-016", "desk-2-016", null),
      room("sp_boardroom", "Boardroom", "meeting_room", "room-boardroom", 12),
      room("sp_huddle_a", "Huddle A", "meeting_room", "room-huddle-a", 4),
      room("sp_phone_1", "Phone Booth 1", "phone_booth", "room-phone-1", 1),
      room("sp_kitchen", "Kitchen", "kitchen", "poi-kitchen", null),
    ]);

    await tx.insert(s.person).values([
      {
        id: "p_jane",
        email: "jane@example.com",
        name: "Jane Park",
        title: "Head of HR",
        homeCountry: "CA",
        homeTimezone: "America/Toronto",
        assignedDeskId: "sp_sf_2_003",
        startDate: "2019-03-04",
      },
      {
        id: "p_max",
        email: "max@example.com",
        name: "Max Osei",
        title: "HR Business Partner",
        homeCountry: "US",
        managerId: "p_jane",
        assignedDeskId: "sp_sf_2_010",
        startDate: "2021-06-14",
      },
      {
        id: "p_bob",
        email: "bob@example.com",
        name: "Bob Lindqvist",
        title: "Payroll Analyst",
        homeCountry: "US",
        managerId: "p_max",
        assignedDeskId: "sp_sf_2_014",
        startDate: "2023-01-09",
      },
      {
        id: "p_priya",
        email: "priya@example.com",
        name: "Priya Raman",
        title: "Recruiter",
        homeCountry: "IN",
        homeTimezone: "Asia/Kolkata",
        managerId: "p_max",
        startDate: "2024-05-20",
      },
      {
        id: "p_sam",
        email: "sam@example.com",
        name: "Sam Ortiz",
        title: "Recruiter",
        homeCountry: "US",
        managerId: "p_max",
        startDate: "2025-02-03",
      },
    ]);

    await tx.insert(s.team).values([
      { id: "t_hr", slug: "hr", name: "HR", leadId: "p_jane", color: "#0ea5e9" },
      { id: "t_recruiting", slug: "recruiting", name: "Recruiting", parentTeamId: "t_hr", color: "#22c55e" },
      { id: "t_payroll", slug: "payroll", name: "Payroll", parentTeamId: "t_hr", color: "#f59e0b" },
    ]);

    await tx.insert(s.teamMember).values([
      { personId: "p_jane", teamId: "t_hr", isPrimary: true },
      { personId: "p_max", teamId: "t_hr", isPrimary: true },
      { personId: "p_bob", teamId: "t_payroll", isPrimary: true },
      { personId: "p_bob", teamId: "t_hr", isPrimary: false },
      { personId: "p_priya", teamId: "t_recruiting", isPrimary: true },
      { personId: "p_sam", teamId: "t_recruiting", isPrimary: true },
    ]);

    // Everyone in the seed has signed in before. Jane is the admin, so the admin pages work on
    // first run.
    await tx.insert(s.appUser).values([
      { email: "jane@example.com", role: "admin" },
      { email: "max@example.com", role: "viewer" },
      { email: "bob@example.com", role: "viewer" },
      { email: "priya@example.com", role: "viewer" },
      { email: "sam@example.com", role: "viewer" },
    ]);
  });
}

function desk(id: string, name: string, svgElementId: string, areaId: string | null) {
  return {
    id,
    floorId: "fl_sf_2",
    areaId,
    kind: "desk" as const,
    svgElementId,
    name,
  };
}

function room(
  id: string,
  name: string,
  kind: "meeting_room" | "phone_booth" | "kitchen",
  svgElementId: string,
  capacity: number | null,
) {
  return { id, floorId: "fl_sf_2", kind, svgElementId, name, capacity };
}

// CLI: `pnpm db:seed` wipes the database and loads the demo data. It refuses to run in production.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in production");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  await resetDatabase(db);
  await seedDemoData(db);
  await pool.end();
  console.log("seeded demo data");
}
