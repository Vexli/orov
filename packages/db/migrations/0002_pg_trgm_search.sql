-- Fuzzy matching for the global search (plan.md §7, /api/search). With fewer than 250 rows per
-- table a sequential scan is fast, so no trigram indexes are created.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
