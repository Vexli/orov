import { z } from "zod";

// The browser's description of a drawing edit (#21), checked before svg/edit.ts applies it.
// Kept apart from that module, which loads jsdom, so the browser can use these types.
const rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const drawingEditSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("addDesk"), rect }),
  z.object({ kind: z.literal("addRoom"), rect, name: z.string().trim().min(1, "Name the room").max(60) }),
  z.object({ kind: z.literal("remove"), svgElementId: z.string().min(1) }),
]);

export type DrawingEditInput = z.infer<typeof drawingEditSchema>;
