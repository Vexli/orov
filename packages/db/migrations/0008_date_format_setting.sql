CREATE TYPE "public"."date_format" AS ENUM('iso', 'dmy', 'mdy');--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "date_format" date_format DEFAULT 'iso' NOT NULL;