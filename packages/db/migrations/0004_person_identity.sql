CREATE TABLE "person_identity" (
	"person_id" text NOT NULL,
	"provider" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "person_identity_person_id_provider_pk" PRIMARY KEY("person_id","provider")
);
--> statement-breakpoint
ALTER TABLE "person_identity" ADD CONSTRAINT "person_identity_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_identity_provider_value" ON "person_identity" USING btree ("provider","value");