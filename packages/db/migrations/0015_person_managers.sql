-- Written by hand: moves person.manager_id into a table so a person can have several managers
-- (N1), keeping every existing manager.

-- Tables and indexes share one namespace, and the old index on person.manager_id has the new
-- table's name, so it goes first.
DROP INDEX "person_manager";--> statement-breakpoint
CREATE TABLE "person_manager" (
	"person_id" text NOT NULL,
	"manager_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "person_manager_person_id_manager_id_pk" PRIMARY KEY("person_id","manager_id")
);--> statement-breakpoint
ALTER TABLE "person_manager" ADD CONSTRAINT "person_manager_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_manager" ADD CONSTRAINT "person_manager_manager_id_person_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_manager_manager" ON "person_manager" USING btree ("manager_id");--> statement-breakpoint
INSERT INTO "person_manager" ("person_id", "manager_id", "position")
SELECT "id", "manager_id", 0 FROM "person" WHERE "manager_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "person" DROP CONSTRAINT "person_manager_id_person_id_fk";--> statement-breakpoint
ALTER TABLE "person" DROP COLUMN "manager_id";
