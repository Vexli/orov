import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { sanitizeSvg } from "@officeorg/core/svg/sanitize";
import { createDb, type Database } from "./client";
import { resetDatabase } from "./reset";
import * as s from "./schema";

// Demo data for local development and the Playwright suite. The people and teams match the
// seed described in plan.md §11: Bob → Max → Jane, HR with two sub-teams, Jane based in Canada
// (CA-ON) with a desk in SF, a South Wing area, and rooms in several states.
//
// Ids are fixed so URLs in tests and docs stay readable (for example ?person=p_bob).
//
// The floor drawings in seed-floors/ follow docs/map-authoring.md, and the space and area rows
// below match the ids in them. Sam sits on Floor 3, so a team spans two floors (U2).

// Stored the way an admin upload would be: through the sanitizer.
const floorSvg = (name: string) =>
  sanitizeSvg(readFileSync(new URL(`./seed-floors/${name}.svg`, import.meta.url), "utf8"));

export async function seedDemoData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(s.location).values({
      id: "loc_sf",
      slug: "sf",
      name: "San Francisco",
      timezone: "America/Los_Angeles",
      region: "US-CA",
      sortOrder: 1,
    });

    // svgAssetId is set after the asset exists, because the two tables reference each other.
    await tx.insert(s.floor).values([
      { id: "fl_sf_2", locationId: "loc_sf", slug: "2", name: "Floor 2", level: 2, sortOrder: 2 },
      { id: "fl_sf_3", locationId: "loc_sf", slug: "3", name: "Floor 3", level: 3, sortOrder: 3 },
    ]);
    for (const level of [2, 3]) {
      const svg = floorSvg(`sf-${level}`);
      await tx.insert(s.svgAsset).values({
        id: `svg_sf_${level}_v1`,
        floorId: `fl_sf_${level}`,
        version: 1,
        sanitizedSvg: svg,
        sha256: createHash("sha256").update(svg).digest("hex"),
        uploadedBy: "seed",
      });
      await tx
        .update(s.floor)
        .set({ svgAssetId: `svg_sf_${level}_v1` })
        .where(eq(s.floor.id, `fl_sf_${level}`));
    }

    await tx.insert(s.area).values([
      area("area_north_wing", "fl_sf_2", "north-wing", "North Wing"),
      area("area_south_wing", "fl_sf_2", "south-wing", "South Wing"),
      area("area_west_wing", "fl_sf_3", "west-wing", "West Wing"),
    ]);

    await tx.insert(s.space).values([
      ...[10, 11, 12, 13, 14, 15, 16].map((n) => desk(2, n, "area_north_wing")),
      ...[1, 2, 3, 4, 5, 6].map((n) => desk(2, n, "area_south_wing")),
      room("sp_boardroom", "fl_sf_2", null, "Boardroom", "meeting_room", "room-boardroom", 12),
      room("sp_huddle_a", "fl_sf_2", "area_south_wing", "Huddle A", "meeting_room", "room-huddle-a", 4),
      room("sp_phone_1", "fl_sf_2", null, "Phone Booth 1", "phone_booth", "room-phone-1", 1),
      room("sp_kitchen", "fl_sf_2", null, "Kitchen", "kitchen", "poi-kitchen", null),
      room("sp_elevator_2", "fl_sf_2", null, "Elevator", "elevator", "poi-elevator", null),
      room("sp_restroom_2", "fl_sf_2", null, "Restroom", "restroom", "poi-restroom", null),

      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => desk(3, n, "area_west_wing")),
      room("sp_phone_2", "fl_sf_3", "area_west_wing", "Phone Booth 2", "phone_booth", "room-phone-2", 1),
      room("sp_workshop", "fl_sf_3", null, "Workshop", "meeting_room", "room-workshop", 20),
      room("sp_kitchen_3", "fl_sf_3", null, "Kitchen", "kitchen", "poi-kitchen", null),
      room("sp_elevator_3", "fl_sf_3", null, "Elevator", "elevator", "poi-elevator", null),
    ]);

    await tx.insert(s.person).values([
      {
        id: "p_jane",
        email: "jane@example.com",
        givenName: "Jane",
        familyName: "Park",
        title: "Head of HR",
        homeRegion: "CA-ON",
        phone: "+14165550199",
        homeTimezone: "America/Toronto",
        assignedDeskId: "sp_sf_2_003",
        startDate: "2019-03-04",
      },
      {
        id: "p_max",
        email: "max@example.com",
        givenName: "Max",
        familyName: "Osei",
        title: "HR Business Partner",
        homeRegion: "US-CA",
        homeTimezone: "America/Los_Angeles",
        managerId: "p_jane",
        assignedDeskId: "sp_sf_2_010",
        startDate: "2021-06-14",
      },
      {
        id: "p_bob",
        email: "bob@example.com",
        givenName: "Bob",
        familyName: "Lindqvist",
        title: "Payroll Analyst",
        homeRegion: "US-CA",
        phone: "+14155550123",
        homeTimezone: "America/Los_Angeles",
        managerId: "p_max",
        assignedDeskId: "sp_sf_2_014",
        startDate: "2023-01-09",
      },
      {
        id: "p_priya",
        email: "priya@example.com",
        givenName: "Priya",
        familyName: "Raman",
        title: "Recruiter",
        homeRegion: "IN-KA",
        homeTimezone: "Asia/Kolkata",
        managerId: "p_max",
        startDate: "2024-05-20",
      },
      {
        id: "p_sam",
        email: "sam@example.com",
        givenName: "Sam",
        familyName: "Ortiz",
        title: "Recruiter",
        homeRegion: "US",
        homeTimezone: "America/Los_Angeles",
        managerId: "p_max",
        assignedDeskId: "sp_sf_3_001",
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

    await tx.insert(s.personIdentity).values([
      { personId: "p_bob", provider: "github", value: "bob-lindqvist" },
      { personId: "p_bob", provider: "linkedin", value: "bob-lindqvist" },
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

// Desk "desk-2-014" on SF floor 2 is space sp_sf_2_014 with the code SF-2-014.
function desk(level: number, n: number, areaId: string) {
  const num = String(n).padStart(3, "0");
  return {
    id: `sp_sf_${level}_${num}`,
    floorId: `fl_sf_${level}`,
    areaId,
    kind: "desk" as const,
    svgElementId: `desk-${level}-${num}`,
    name: `SF-${level}-${num}`,
  };
}

function area(id: string, floorId: string, slug: string, name: string) {
  return { id, floorId, slug, name, svgElementId: `area-${slug}` };
}

function room(
  id: string,
  floorId: string,
  areaId: string | null,
  name: string,
  kind: "meeting_room" | "phone_booth" | "kitchen" | "elevator" | "restroom",
  svgElementId: string,
  capacity: number | null,
) {
  return { id, floorId, areaId, kind, svgElementId, name, capacity };
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
