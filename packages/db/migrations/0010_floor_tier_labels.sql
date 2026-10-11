ALTER TABLE "location" ADD COLUMN "floor_label_singular" text DEFAULT 'Floor' NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "floor_label_plural" text DEFAULT 'Floors' NOT NULL;