-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 050 — Fix opportunities apply_url unique index
-- Ensures ON CONFLICT(apply_url) can be used safely in future.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old partial unique index if it exists
DROP INDEX IF EXISTS uniq_opportunities_apply_url;

-- Create a standard UNIQUE index.
-- Postgres allows multiple NULLs in UNIQUE indexes, so this is safe.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_opportunities_apply_url
  ON opportunities (apply_url);

