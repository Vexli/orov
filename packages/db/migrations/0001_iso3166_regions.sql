CREATE TYPE "public"."region_display" AS ENUM('code', 'country', 'region', 'country_region');--> statement-breakpoint
ALTER TABLE "location" RENAME COLUMN "country" TO "region";--> statement-breakpoint
ALTER TABLE "person" RENAME COLUMN "home_country" TO "home_region";--> statement-breakpoint
-- Added by hand: drizzle-kit drops the type change when a column is renamed in the same migration.
ALTER TABLE "location" ALTER COLUMN "region" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "home_region" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "region_display" "region_display" DEFAULT 'country_region' NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_region_iso3166" CHECK ("location"."region" ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$');--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_home_region_iso3166" CHECK ("person"."home_region" ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$');