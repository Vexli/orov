CREATE TYPE "public"."app_role" AS ENUM('viewer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."presence_date_scope" AS ENUM('today', 'tomorrow', 'parse');--> statement-breakpoint
CREATE TYPE "public"."presence_match_type" AS ENUM('keyword', 'regex');--> statement-breakpoint
CREATE TYPE "public"."presence_source" AS ENUM('slack_message', 'gcal_ooo', 'gcal_working_location', 'manual');--> statement-breakpoint
CREATE TYPE "public"."presence_status" AS ENUM('sick', 'vacation', 'ooo', 'wfh', 'in_office', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."room_state" AS ENUM('free', 'busy', 'soon');--> statement-breakpoint
CREATE TYPE "public"."space_kind" AS ENUM('desk', 'meeting_room', 'phone_booth', 'kitchen', 'elevator', 'restroom', 'other');--> statement-breakpoint
CREATE TABLE "app_user" (
	"email" text PRIMARY KEY NOT NULL,
	"role" "app_role" DEFAULT 'viewer' NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "area" (
	"id" text PRIMARY KEY NOT NULL,
	"floor_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"svg_element_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_email" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floor" (
	"id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"svg_asset_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_run" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "integration_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean NOT NULL,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"country" char(2) NOT NULL,
	"google_building_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "location_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"preferred_name" text,
	"title" text,
	"photo_url" text,
	"phone" text,
	"home_country" char(2) NOT NULL,
	"home_timezone" text,
	"manager_id" text,
	"assigned_desk_id" text,
	"slack_user_id" text,
	"start_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_email_unique" UNIQUE("email"),
	CONSTRAINT "person_slack_user_id_unique" UNIQUE("slack_user_id")
);
--> statement-breakpoint
CREATE TABLE "presence_day" (
	"person_id" text NOT NULL,
	"date" date NOT NULL,
	"status" "presence_status" NOT NULL,
	"winning_signal_id" text,
	CONSTRAINT "presence_day_person_id_date_pk" PRIMARY KEY("person_id","date")
);
--> statement-breakpoint
CREATE TABLE "presence_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"priority" integer NOT NULL,
	"pattern" text NOT NULL,
	"match_type" "presence_match_type" NOT NULL,
	"status" "presence_status" NOT NULL,
	"date_scope" "presence_date_scope" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presence_signal" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"date" date NOT NULL,
	"status" "presence_status" NOT NULL,
	"source" "presence_source" NOT NULL,
	"source_ref" text NOT NULL,
	"note" text,
	"observed_at" timestamp with time zone NOT NULL,
	"retracted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_status" (
	"space_id" text PRIMARY KEY NOT NULL,
	"state" "room_state" NOT NULL,
	"current_until" timestamp with time zone,
	"next_starts_at" timestamp with time zone,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_user_token" (
	"person_id" text PRIMARY KEY NOT NULL,
	"encrypted_token" text NOT NULL,
	"scopes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space" (
	"id" text PRIMARY KEY NOT NULL,
	"floor_id" text NOT NULL,
	"area_id" text,
	"kind" "space_kind" NOT NULL,
	"svg_element_id" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"google_resource_email" text,
	"archived_at" timestamp with time zone,
	CONSTRAINT "space_google_resource_email_unique" UNIQUE("google_resource_email")
);
--> statement-breakpoint
CREATE TABLE "svg_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"floor_id" text NOT NULL,
	"version" integer NOT NULL,
	"sanitized_svg" text NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_team_id" text,
	"lead_id" text,
	"slack_channel_id" text,
	"color" text,
	CONSTRAINT "team_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"person_id" text NOT NULL,
	"team_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "team_member_person_id_team_id_pk" PRIMARY KEY("person_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "area" ADD CONSTRAINT "area_floor_id_floor_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor" ADD CONSTRAINT "floor_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor" ADD CONSTRAINT "floor_svg_asset_id_svg_asset_id_fk" FOREIGN KEY ("svg_asset_id") REFERENCES "public"."svg_asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_manager_id_person_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_assigned_desk_id_space_id_fk" FOREIGN KEY ("assigned_desk_id") REFERENCES "public"."space"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_day" ADD CONSTRAINT "presence_day_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_day" ADD CONSTRAINT "presence_day_winning_signal_id_presence_signal_id_fk" FOREIGN KEY ("winning_signal_id") REFERENCES "public"."presence_signal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_signal" ADD CONSTRAINT "presence_signal_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_status" ADD CONSTRAINT "room_status_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_user_token" ADD CONSTRAINT "slack_user_token_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_floor_id_floor_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "svg_asset" ADD CONSTRAINT "svg_asset_floor_id_floor_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_parent_team_id_team_id_fk" FOREIGN KEY ("parent_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_lead_id_person_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "area_floor_svg" ON "area" USING btree ("floor_id","svg_element_id");--> statement-breakpoint
CREATE UNIQUE INDEX "area_floor_slug" ON "area" USING btree ("floor_id","slug");--> statement-breakpoint
CREATE INDEX "audit_log_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "floor_location_slug" ON "floor" USING btree ("location_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "person_assigned_desk" ON "person" USING btree ("assigned_desk_id") WHERE "person"."assigned_desk_id" is not null;--> statement-breakpoint
CREATE INDEX "person_manager" ON "person" USING btree ("manager_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presence_signal_source" ON "presence_signal" USING btree ("source","source_ref","date");--> statement-breakpoint
CREATE UNIQUE INDEX "space_floor_svg" ON "space" USING btree ("floor_id","svg_element_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_desk_name" ON "space" USING btree ("name") WHERE "space"."kind" = 'desk';--> statement-breakpoint
CREATE UNIQUE INDEX "svg_asset_floor_version" ON "svg_asset" USING btree ("floor_id","version");--> statement-breakpoint
CREATE INDEX "team_parent" ON "team" USING btree ("parent_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_one_primary" ON "team_member" USING btree ("person_id") WHERE "team_member"."is_primary" = true;