import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import {
  diffFloor,
  hasChanges,
  type ExistingArea,
  type ExistingSpace,
  type FloorDiff,
  type FloorForm,
  type LocationForm,
  type AreaEdit,
  type SpaceEdit,
} from "@officeorg/core";
import { DrawingEditError, editDrawing, type DrawingEdit } from "@officeorg/core/svg/edit";
import { parseFloorSvg } from "@officeorg/core/svg/parse";
import { sanitizeSvg, SvgError } from "@officeorg/core/svg/sanitize";
import type { Database, Executor } from "../client";
import * as s from "../schema";
import { recordAudit } from "./audit";
import { ValidationError } from "./errors";
import { loadPersonRecord } from "./people";

// Offices, floors and floor drawings (plan.md §6 and §9). Uploads and rollbacks share one path:
// sanitize, parse, diff against the floor's rows, then apply in a single transaction.

export async function listLocationsWithFloors(db: Executor) {
  const locations = await db.query.location.findMany({
    orderBy: (l, { asc }) => [asc(l.sortOrder), asc(l.name)],
    with: {
      floors: {
        orderBy: (f, { asc }) => [asc(f.sortOrder), asc(f.level)],
      },
    },
  });
  const deskCounts = await db
    .select({ floorId: s.space.floorId, id: s.space.id })
    .from(s.space)
    .where(and(eq(s.space.kind, "desk"), isNull(s.space.archivedAt)));
  const perFloor = new Map<string, number>();
  for (const d of deskCounts) perFloor.set(d.floorId, (perFloor.get(d.floorId) ?? 0) + 1);
  return locations.map((l) => ({
    ...l,
    floors: l.floors.map((f) => ({ ...f, deskCount: perFloor.get(f.id) ?? 0 })),
  }));
}

export async function getLocation(db: Executor, id: string) {
  return db.query.location.findFirst({ where: eq(s.location.id, id) });
}

export async function saveLocation(
  db: Database,
  actorEmail: string,
  input: LocationForm,
  id?: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const before = id ? await getLocation(tx, id) : null;
    if (id && !before) throw new ValidationError("This office no longer exists.");

    const slugTaken = await tx.query.location.findFirst({
      where: and(eq(s.location.slug, input.slug), id ? ne(s.location.id, id) : undefined),
      columns: { id: true },
    });
    if (slugTaken) throw new ValidationError("Another office already uses this slug.", "slug");

    // Desk codes start with the office slug ("SF-2-014"), so it can't change once floors exist.
    if (before && before.slug !== input.slug) {
      const floor = await tx.query.floor.findFirst({
        where: eq(s.floor.locationId, before.id),
        columns: { id: true },
      });
      if (floor)
        throw new ValidationError(
          "The slug can't change once the office has floors, because desk codes use it.",
          "slug",
        );
    }

    const values = { ...input };
    const locationId = id
      ? (
          await tx
            .update(s.location)
            .set(values)
            .where(eq(s.location.id, id))
            .returning({ id: s.location.id })
        )[0]!.id
      : (await tx.insert(s.location).values(values).returning({ id: s.location.id }))[0]!.id;

    const after = await getLocation(tx, locationId);
    await recordAudit(tx, actorEmail, {
      entity: "location",
      entityId: locationId,
      action: id ? "update" : "create",
      before,
      after,
    });
    return { id: locationId };
  });
}

export async function getFloorForAdmin(db: Executor, id: string) {
  const floor = await db.query.floor.findFirst({
    where: eq(s.floor.id, id),
    with: { location: true },
  });
  if (!floor) return null;
  const versions = await db
    .select({
      id: s.svgAsset.id,
      version: s.svgAsset.version,
      sha256: s.svgAsset.sha256,
      uploadedBy: s.svgAsset.uploadedBy,
      uploadedAt: s.svgAsset.uploadedAt,
    })
    .from(s.svgAsset)
    .where(eq(s.svgAsset.floorId, id))
    .orderBy(desc(s.svgAsset.version));
  const current = floor.svgAssetId
    ? await db.query.svgAsset.findFirst({
        where: eq(s.svgAsset.id, floor.svgAssetId),
        columns: { sanitizedSvg: true },
      })
    : null;
  return { ...floor, versions, currentSvg: current?.sanitizedSvg ?? null };
}

export async function saveFloor(
  db: Database,
  actorEmail: string,
  locationId: string,
  input: FloorForm,
  id?: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const before = id ? await tx.query.floor.findFirst({ where: eq(s.floor.id, id) }) : null;
    if (id && (!before || before.locationId !== locationId)) {
      throw new ValidationError("This floor no longer exists.");
    }
    const location = await getLocation(tx, locationId);
    if (!location) throw new ValidationError("This office no longer exists.");

    const slugTaken = await tx.query.floor.findFirst({
      where: and(
        eq(s.floor.locationId, locationId),
        eq(s.floor.slug, input.slug),
        id ? ne(s.floor.id, id) : undefined,
      ),
      columns: { id: true },
    });
    if (slugTaken)
      throw new ValidationError(`${location.name} already has a floor with this slug.`, "slug");

    // Desk ids in the drawing carry the floor slug ("desk-2-014"), so it is fixed once a drawing exists.
    if (before && before.slug !== input.slug && before.svgAssetId) {
      throw new ValidationError(
        "The slug can't change once a drawing is uploaded, because desk ids use it.",
        "slug",
      );
    }

    const floorId = id
      ? (
          await tx
            .update(s.floor)
            .set(input)
            .where(eq(s.floor.id, id))
            .returning({ id: s.floor.id })
        )[0]!.id
      : (
          await tx
            .insert(s.floor)
            .values({ ...input, locationId })
            .returning({ id: s.floor.id })
        )[0]!.id;

    const after = await tx.query.floor.findFirst({ where: eq(s.floor.id, floorId) });
    await recordAudit(tx, actorEmail, {
      entity: "floor",
      entityId: floorId,
      action: id ? "update" : "create",
      before,
      after,
    });
    return { id: floorId };
  });
}

// The floor's areas and spaces in the shape the diff compares against, archived spaces included
// so that a desk that comes back is restored rather than created twice.
export async function loadFloorState(db: Executor, floorId: string) {
  const areas = await db.query.area.findMany({ where: eq(s.area.floorId, floorId) });
  const spaces = await db.query.space.findMany({ where: eq(s.space.floorId, floorId) });
  const holders = spaces.length
    ? await db
        .select({ id: s.person.id, name: s.person.name, deskId: s.person.assignedDeskId })
        .from(s.person)
        .where(
          inArray(
            s.person.assignedDeskId,
            spaces.map((sp) => sp.id),
          ),
        )
    : [];
  const holderByDesk = new Map(holders.map((h) => [h.deskId, h]));

  return {
    areas: areas.map<ExistingArea>((a) => ({
      id: a.id,
      svgElementId: a.svgElementId,
      name: a.name,
    })),
    spaces: spaces.map<ExistingSpace>((sp) => {
      const holder = holderByDesk.get(sp.id);
      return {
        id: sp.id,
        svgElementId: sp.svgElementId,
        kind: sp.kind,
        name: sp.name,
        areaId: sp.areaId,
        archived: sp.archivedAt !== null,
        assignedTo: holder ? { personId: holder.id, name: holder.name } : null,
      };
    }),
  };
}

export interface FloorPreview {
  diff: FloorDiff;
  // True when the drawing is byte-for-byte the floor's current one.
  identical: boolean;
  sanitizedSvg: string;
}

type FloorRow = typeof s.floor.$inferSelect & { location: typeof s.location.$inferSelect };

async function findFloor(db: Executor, floorId: string): Promise<FloorRow> {
  const floor = await db.query.floor.findFirst({
    where: eq(s.floor.id, floorId),
    with: { location: true },
  });
  if (!floor) throw new ValidationError("This floor no longer exists.");
  return floor;
}

function clean(raw: string): string {
  try {
    return sanitizeSvg(raw);
  } catch (error) {
    if (error instanceof SvgError) throw new ValidationError(error.message);
    throw error;
  }
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function plan(db: Executor, floor: FloorRow, sanitizedSvg: string): Promise<FloorPreview> {
  const parsed = parseFloorSvg(sanitizedSvg, {
    floorSlug: floor.slug,
    locationSlug: floor.location.slug,
  });
  const diff = diffFloor(parsed, await loadFloorState(db, floor.id));
  const current = floor.svgAssetId
    ? await db.query.svgAsset.findFirst({
        where: eq(s.svgAsset.id, floor.svgAssetId),
        columns: { sha256: true },
      })
    : null;
  return { diff, identical: current?.sha256 === sha256(sanitizedSvg), sanitizedSvg };
}

// What uploading `raw` would change. Nothing is written.
export async function previewFloorUpload(
  db: Executor,
  floorId: string,
  raw: string,
): Promise<FloorPreview> {
  const floor = await findFloor(db, floorId);
  return plan(db, floor, clean(raw));
}

// Applies one edit made in the browser (#21) to `base` (the current drawing when null) and
// previews the result exactly as an upload of it would be. Nothing is written: applying goes
// through applyFloorUpload with the returned drawing, as a new version.
export async function previewDrawingEdit(
  db: Executor,
  floorId: string,
  base: string | null,
  edit: DrawingEdit,
): Promise<FloorPreview & { svg: string; svgElementId: string }> {
  const floor = await findFloor(db, floorId);
  let drawing = base;
  if (drawing === null) {
    if (!floor.svgAssetId) throw new ValidationError("Upload a drawing first; edits change an existing one.");
    drawing = (await findAsset(db, floorId, floor.svgAssetId)).sanitizedSvg;
  }
  try {
    const edited = editDrawing(clean(drawing), floor.slug, edit);
    const svg = clean(edited.svg);
    return { ...(await plan(db, floor, svg)), svg, svgElementId: edited.svgElementId };
  } catch (error) {
    if (error instanceof DrawingEditError) throw new ValidationError(error.message);
    throw error;
  }
}

async function findAsset(db: Executor, floorId: string, assetId: string) {
  const asset = await db.query.svgAsset.findFirst({
    where: and(eq(s.svgAsset.id, assetId), eq(s.svgAsset.floorId, floorId)),
  });
  if (!asset) throw new ValidationError("That version of the drawing no longer exists.");
  return asset;
}

// What switching back to an earlier version would change. Nothing is written.
export async function previewFloorRollback(
  db: Executor,
  floorId: string,
  assetId: string,
): Promise<FloorPreview> {
  const floor = await findFloor(db, floorId);
  const asset = await findAsset(db, floorId, assetId);
  return plan(db, floor, asset.sanitizedSvg);
}

export interface ApplyOptions {
  // The admin has seen who loses their desk and accepts that they become deskless.
  confirmDeskless: boolean;
}

export interface ApplyResult {
  version: number;
  svgAssetId: string;
}

// Stores `raw` as the floor's next version and brings its areas and spaces in line with it.
export async function applyFloorUpload(
  db: Database,
  actorEmail: string,
  floorId: string,
  raw: string,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const sanitizedSvg = clean(raw);
  return db.transaction(async (tx) => {
    const floor = await lockFloor(tx, floorId);
    const preview = await plan(tx, floor, sanitizedSvg);
    if (preview.identical)
      throw new ValidationError("This drawing is the same as the current version.");
    assertApplicable(preview.diff, options);

    const [latest] = await tx
      .select({ version: max(s.svgAsset.version) })
      .from(s.svgAsset)
      .where(eq(s.svgAsset.floorId, floorId));
    const version = (latest?.version ?? 0) + 1;
    const [asset] = await tx
      .insert(s.svgAsset)
      .values({
        floorId,
        version,
        sanitizedSvg,
        sha256: sha256(sanitizedSvg),
        uploadedBy: actorEmail,
      })
      .returning({ id: s.svgAsset.id });

    await applyDiff(tx, actorEmail, floor, preview.diff, asset!.id, version, "upload");
    return { version, svgAssetId: asset!.id };
  });
}

// Makes an earlier version current again. The version list is kept as it is.
export async function rollbackFloor(
  db: Database,
  actorEmail: string,
  floorId: string,
  assetId: string,
  options: ApplyOptions,
): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const floor = await lockFloor(tx, floorId);
    const asset = await findAsset(tx, floorId, assetId);
    if (floor.svgAssetId === asset.id)
      throw new ValidationError(`Version ${asset.version} is already current.`);
    const preview = await plan(tx, floor, asset.sanitizedSvg);
    assertApplicable(preview.diff, options);
    await applyDiff(tx, actorEmail, floor, preview.diff, asset.id, asset.version, "rollback");
    return { version: asset.version, svgAssetId: asset.id };
  });
}

// Uploads to one floor run one at a time, so two admins can't both apply a diff planned
// against the same starting rows.
async function lockFloor(tx: Executor, floorId: string): Promise<FloorRow> {
  await tx.select({ id: s.floor.id }).from(s.floor).where(eq(s.floor.id, floorId)).for("update");
  return findFloor(tx, floorId);
}

function assertApplicable(diff: FloorDiff, options: ApplyOptions) {
  if (diff.errors.length > 0) {
    throw new ValidationError(`Fix the drawing first: ${diff.errors.join(" ")}`);
  }
  if (diff.spaces.removedAssigned.length > 0 && !options.confirmDeskless) {
    const names = diff.spaces.removedAssigned
      .map((sp) => `${sp.assignedTo!.name} (${sp.name})`)
      .join(", ");
    throw new ValidationError(
      `These desks are removed but still assigned: ${names}. Confirm they become deskless, or move them first.`,
    );
  }
}

async function applyDiff(
  tx: Executor,
  actorEmail: string,
  floor: FloorRow,
  diff: FloorDiff,
  svgAssetId: string,
  version: number,
  how: "upload" | "rollback",
) {
  const now = new Date();
  const floorId = floor.id;

  // Areas first, so new spaces can point at them.
  const areaIdBySvg = new Map(diff.areas.unchanged.map((a) => [a.svgElementId, a.id]));
  if (diff.areas.added.length > 0) {
    const inserted = await tx
      .insert(s.area)
      .values(
        diff.areas.added.map((a) => ({
          floorId,
          slug: a.slug,
          name: a.name,
          svgElementId: a.svgElementId,
        })),
      )
      .returning({ id: s.area.id, svgElementId: s.area.svgElementId });
    for (const a of inserted) areaIdBySvg.set(a.svgElementId, a.id);
  }
  const areaId = (svgId: string | null) => (svgId ? (areaIdBySvg.get(svgId) ?? null) : null);

  // People at removed desks become deskless. The admin confirmed this before we got here.
  for (const sp of diff.spaces.removedAssigned) {
    const personId = sp.assignedTo!.personId;
    const before = await loadPersonRecord(tx, personId);
    await tx
      .update(s.person)
      .set({ assignedDeskId: null, updatedAt: now })
      .where(eq(s.person.id, personId));
    const after = await loadPersonRecord(tx, personId);
    await recordAudit(tx, actorEmail, {
      entity: "person",
      entityId: personId,
      action: "update",
      before,
      after,
    });
  }

  const archived = [...diff.spaces.removedUnassigned, ...diff.spaces.removedAssigned];
  if (archived.length > 0) {
    await tx
      .update(s.space)
      .set({ archivedAt: now, areaId: null })
      .where(
        inArray(
          s.space.id,
          archived.map((sp) => sp.id),
        ),
      );
  }

  for (const m of diff.spaces.moved) {
    await tx
      .update(s.space)
      .set({ areaId: areaId(m.to) })
      .where(eq(s.space.id, m.space.id));
  }

  for (const sp of diff.spaces.added.filter((a) => a.restoreId)) {
    await tx
      .update(s.space)
      .set({ archivedAt: null, areaId: areaId(sp.areaSvgElementId) })
      .where(eq(s.space.id, sp.restoreId!));
  }
  const created = diff.spaces.added.filter((a) => !a.restoreId);
  if (created.length > 0) {
    try {
      await tx.insert(s.space).values(
        created.map((sp) => ({
          floorId,
          areaId: areaId(sp.areaSvgElementId),
          kind: sp.kind,
          svgElementId: sp.svgElementId,
          name: sp.name,
        })),
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ValidationError(
          "A new desk's code is already used by another desk. Check the desk numbers.",
        );
      }
      throw error;
    }
  }

  // Removed areas go last, after every space has been moved out of them. Archived spaces can
  // still point at an area, so clear those too.
  const removedAreaIds = diff.areas.removed.map((a) => a.id);
  if (removedAreaIds.length > 0) {
    await tx.update(s.space).set({ areaId: null }).where(inArray(s.space.areaId, removedAreaIds));
    await tx.delete(s.area).where(inArray(s.area.id, removedAreaIds));
  }

  const previous = floor.svgAssetId
    ? await tx.query.svgAsset.findFirst({
        where: eq(s.svgAsset.id, floor.svgAssetId),
        columns: { version: true },
      })
    : null;
  await tx.update(s.floor).set({ svgAssetId }).where(eq(s.floor.id, floorId));

  const ids = (list: { svgElementId: string }[]) => list.map((x) => x.svgElementId);
  await recordAudit(tx, actorEmail, {
    entity: "floor",
    entityId: floorId,
    action: "update",
    before: { version: previous?.version ?? null },
    after: {
      version,
      how,
      changed: hasChanges(diff),
      areasAdded: ids(diff.areas.added),
      areasRemoved: ids(diff.areas.removed),
      spacesAdded: ids(diff.spaces.added),
      spacesMoved: diff.spaces.moved.map((m) => m.space.svgElementId),
      spacesArchived: ids(archived),
      madeDeskless: diff.spaces.removedAssigned.map((sp) => sp.assignedTo!.name),
    },
  });
}

// The rooms, points of interest and areas of a floor, for renaming them (#21). Desks are left out:
// their names are codes that imports and the seat picker look them up by.
export async function listFloorSpacesForAdmin(db: Executor, floorId: string) {
  const [areas, spaces] = await Promise.all([
    db.query.area.findMany({
      where: eq(s.area.floorId, floorId),
      columns: { id: true, name: true, svgElementId: true },
      orderBy: (a, { asc }) => [asc(a.name)],
    }),
    db.query.space.findMany({
      where: and(eq(s.space.floorId, floorId), isNull(s.space.archivedAt), ne(s.space.kind, "desk")),
      columns: { id: true, name: true, kind: true, capacity: true, svgElementId: true },
      orderBy: (sp, { asc }) => [asc(sp.name)],
    }),
  ]);
  return { areas, spaces };
}

export async function saveSpace(db: Database, actorEmail: string, id: string, input: SpaceEdit): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await tx.query.space.findFirst({ where: eq(s.space.id, id) });
    if (!before) throw new ValidationError("This room no longer exists.");
    if (before.kind === "desk") {
      throw new ValidationError("A desk's name is its code, which imports and the seat picker use. It can't be renamed.");
    }
    // Capacity only means something for rooms people meet in.
    const capacity = before.kind === "meeting_room" || before.kind === "phone_booth" ? input.capacity : before.capacity;
    const [after] = await tx
      .update(s.space)
      .set({ name: input.name, capacity })
      .where(eq(s.space.id, id))
      .returning();
    await recordAudit(tx, actorEmail, { entity: "space", entityId: id, action: "update", before, after });
  });
}

export async function saveArea(db: Database, actorEmail: string, id: string, input: AreaEdit): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await tx.query.area.findFirst({ where: eq(s.area.id, id) });
    if (!before) throw new ValidationError("This area no longer exists.");
    const [after] = await tx.update(s.area).set({ name: input.name }).where(eq(s.area.id, id)).returning();
    await recordAudit(tx, actorEmail, { entity: "area", entityId: id, action: "update", before, after });
  });
}

// Archiving and deleting (#22). Archiving hides a floor or office from every view but keeps its
// history; anyone with a desk there is made deskless, which the admin confirms first, as with an
// upload. Only a floor or office that was never used (no drawing ever uploaded) can be deleted.

export interface ArchiveOptions {
  // The admin has seen who loses their desk and accepts it.
  confirmDeskless: boolean;
}

export class DesklessConfirmationNeeded extends ValidationError {
  constructor(readonly people: string[]) {
    super(`${people.join(", ")} ${people.length === 1 ? "has a desk" : "have desks"} here and would have none. Confirm to continue.`);
  }
}

async function freeDesksOn(tx: Executor, actorEmail: string, floorIds: string[], confirm: boolean) {
  if (floorIds.length === 0) return;
  const holders = await tx
    .select({ id: s.person.id, name: s.person.name })
    .from(s.person)
    .innerJoin(s.space, eq(s.space.id, s.person.assignedDeskId))
    .where(inArray(s.space.floorId, floorIds));
  if (holders.length === 0) return;
  if (!confirm) throw new DesklessConfirmationNeeded(holders.map((h) => h.name).sort());
  for (const holder of holders) {
    const before = await loadPersonRecord(tx, holder.id);
    await tx.update(s.person).set({ assignedDeskId: null, updatedAt: new Date() }).where(eq(s.person.id, holder.id));
    const after = await loadPersonRecord(tx, holder.id);
    await recordAudit(tx, actorEmail, { entity: "person", entityId: holder.id, action: "update", before, after });
  }
}

export async function setFloorArchived(
  db: Database,
  actorEmail: string,
  floorId: string,
  archived: boolean,
  options: ArchiveOptions = { confirmDeskless: false },
): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await tx.query.floor.findFirst({ where: eq(s.floor.id, floorId) });
    if (!before) throw new ValidationError("This floor no longer exists.");
    const office = await getLocation(tx, before.locationId);
    if (!archived && office?.archivedAt) {
      throw new ValidationError(`${office.name} is archived. Unarchive the office first.`);
    }
    if (archived) await freeDesksOn(tx, actorEmail, [floorId], options.confirmDeskless);
    const [after] = await tx
      .update(s.floor)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(s.floor.id, floorId))
      .returning();
    await recordAudit(tx, actorEmail, { entity: "floor", entityId: floorId, action: "update", before, after });
  });
}

// Unarchiving an office brings back the floors archived with it, not ones archived earlier.
export async function setLocationArchived(
  db: Database,
  actorEmail: string,
  locationId: string,
  archived: boolean,
  options: ArchiveOptions = { confirmDeskless: false },
): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await getLocation(tx, locationId);
    if (!before) throw new ValidationError("This office no longer exists.");
    const floors = await tx.query.floor.findMany({ where: eq(s.floor.locationId, locationId) });
    const now = new Date();
    if (archived) {
      const live = floors.filter((f) => f.archivedAt === null).map((f) => f.id);
      await freeDesksOn(tx, actorEmail, live, options.confirmDeskless);
      if (live.length > 0) await tx.update(s.floor).set({ archivedAt: now }).where(inArray(s.floor.id, live));
    } else if (before.archivedAt) {
      const withOffice = floors.filter((f) => f.archivedAt?.getTime() === before.archivedAt!.getTime());
      if (withOffice.length > 0) {
        await tx.update(s.floor).set({ archivedAt: null }).where(inArray(s.floor.id, withOffice.map((f) => f.id)));
      }
    }
    const [after] = await tx
      .update(s.location)
      .set({ archivedAt: archived ? now : null })
      .where(eq(s.location.id, locationId))
      .returning();
    await recordAudit(tx, actorEmail, { entity: "location", entityId: locationId, action: "update", before, after });
  });
}

// A floor that never had a drawing has no rooms, desks or history, so nothing can point at it.
async function refuseIfUsed(tx: Executor, floorIds: string[], what: string) {
  if (floorIds.length === 0) return;
  const asset = await tx.query.svgAsset.findFirst({ where: inArray(s.svgAsset.floorId, floorIds), columns: { id: true } });
  if (asset) throw new ValidationError(`${what} has had a drawing, so its history is kept. Archive it instead.`);
}

export async function deleteFloor(db: Database, actorEmail: string, floorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await tx.query.floor.findFirst({ where: eq(s.floor.id, floorId) });
    if (!before) throw new ValidationError("This floor no longer exists.");
    await refuseIfUsed(tx, [floorId], before.name);
    await tx.delete(s.floor).where(eq(s.floor.id, floorId));
    await recordAudit(tx, actorEmail, { entity: "floor", entityId: floorId, action: "delete", before, after: null });
  });
}

export async function deleteLocation(db: Database, actorEmail: string, locationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await getLocation(tx, locationId);
    if (!before) throw new ValidationError("This office no longer exists.");
    const floors = await tx.query.floor.findMany({ where: eq(s.floor.locationId, locationId) });
    await refuseIfUsed(tx, floors.map((f) => f.id), before.name);
    // People can belong to an office without a desk (N9).
    const member = await tx.query.person.findFirst({ where: eq(s.person.officeId, locationId), columns: { name: true } });
    if (member) throw new ValidationError(`${member.name} belongs to ${before.name}. Move them first, or archive it instead.`);
    for (const floor of floors) {
      await tx.delete(s.floor).where(eq(s.floor.id, floor.id));
      await recordAudit(tx, actorEmail, { entity: "floor", entityId: floor.id, action: "delete", before: floor, after: null });
    }
    await tx.delete(s.location).where(eq(s.location.id, locationId));
    await recordAudit(tx, actorEmail, { entity: "location", entityId: locationId, action: "delete", before, after: null });
  });
}
