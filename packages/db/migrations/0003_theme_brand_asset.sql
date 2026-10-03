CREATE TYPE "public"."brand_asset_kind" AS ENUM('logo_light', 'logo_dark', 'favicon', 'font');--> statement-breakpoint
CREATE TYPE "public"."theme_source_format" AS ENUM('dtcg', 'tokens_studio');--> statement-breakpoint
CREATE TABLE "brand_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "brand_asset_kind" NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"source_format" "theme_source_format" NOT NULL,
	"source_tokens" jsonb NOT NULL,
	"mapping" jsonb NOT NULL,
	"values" jsonb NOT NULL,
	"compiled_css" text NOT NULL,
	"sha256" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "theme_one_active" ON "theme" USING btree ("active") WHERE "theme"."active";