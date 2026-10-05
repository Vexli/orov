-- Written by hand: the backfill and the switch of `name` to a generated column need an order
-- drizzle-kit doesn't produce. Postgres can't turn an existing column into a generated one, so
-- `name` is dropped and added back.

ALTER TABLE "person" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "family_name" text;--> statement-breakpoint

-- Split on the last run of whitespace: "Mary Ann Smith" → "Mary Ann" / "Smith". A single word
-- is a given name only. The rebuilt name differs from the old one only in whitespace.
UPDATE "person" SET
  "given_name" = CASE
    WHEN btrim("name") ~ '\s' THEN regexp_replace(btrim("name"), '\s+\S+$', '')
    ELSE btrim("name")
  END,
  "family_name" = CASE
    WHEN btrim("name") ~ '\s' THEN substring(btrim("name") from '(\S+)$')
    ELSE NULL
  END;--> statement-breakpoint

ALTER TABLE "person" ALTER COLUMN "given_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "person" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "name" text GENERATED ALWAYS AS (CASE WHEN family_name IS NULL OR family_name = '' THEN given_name ELSE given_name || ' ' || family_name END) STORED NOT NULL;
