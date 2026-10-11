-- Written by hand: drizzle-kit asks interactively whether a changed column is a rename. Every
-- column here is a rename or a move, so no data is lost. The Slack and Google columns were in
-- the schema before any integration wrote to them; see note #4–6 in plan.md Phase 7.

-- Messaging-tool user ids live in person_identity (#12), provider "slack".
INSERT INTO "person_identity" ("person_id", "provider", "value")
SELECT "id", 'slack', "slack_user_id" FROM "person" WHERE "slack_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "person" DROP CONSTRAINT "person_slack_user_id_unique";--> statement-breakpoint
ALTER TABLE "person" DROP COLUMN "slack_user_id";--> statement-breakpoint

-- One user token per person and messaging provider. Existing tokens are Slack's.
ALTER TABLE "slack_user_token" RENAME TO "messaging_user_token";--> statement-breakpoint
ALTER TABLE "messaging_user_token" RENAME CONSTRAINT "slack_user_token_person_id_person_id_fk" TO "messaging_user_token_person_id_person_id_fk";--> statement-breakpoint
ALTER TABLE "messaging_user_token" ADD COLUMN "provider" text DEFAULT 'slack' NOT NULL;--> statement-breakpoint
ALTER TABLE "messaging_user_token" ALTER COLUMN "provider" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messaging_user_token" DROP CONSTRAINT "slack_user_token_pkey";--> statement-breakpoint
ALTER TABLE "messaging_user_token" ADD CONSTRAINT "messaging_user_token_person_id_provider_pk" PRIMARY KEY("person_id","provider");--> statement-breakpoint

ALTER TABLE "team" RENAME COLUMN "slack_channel_id" TO "chat_channel_id";--> statement-breakpoint
ALTER TABLE "space" RENAME COLUMN "google_resource_email" TO "calendar_resource_id";--> statement-breakpoint
ALTER TABLE "space" RENAME CONSTRAINT "space_google_resource_email_unique" TO "space_calendar_resource_id_unique";--> statement-breakpoint
ALTER TABLE "location" RENAME COLUMN "google_building_id" TO "external_building_id";--> statement-breakpoint

-- Presence sources name the kind of signal; presence_signal.provider names the tool.
ALTER TYPE "public"."presence_source" RENAME VALUE 'slack_message' TO 'message';--> statement-breakpoint
ALTER TYPE "public"."presence_source" RENAME VALUE 'gcal_ooo' TO 'calendar_ooo';--> statement-breakpoint
ALTER TYPE "public"."presence_source" RENAME VALUE 'gcal_working_location' TO 'calendar_working_location';--> statement-breakpoint
ALTER TABLE "presence_signal" ADD COLUMN "provider" text;--> statement-breakpoint
UPDATE "presence_signal" SET "provider" = CASE "source"
  WHEN 'message' THEN 'slack'
  WHEN 'manual' THEN 'manual'
  ELSE 'google'
END;--> statement-breakpoint
ALTER TABLE "presence_signal" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
DROP INDEX "presence_signal_source";--> statement-breakpoint
CREATE UNIQUE INDEX "presence_signal_source" ON "presence_signal" USING btree ("provider","source","source_ref","date");
