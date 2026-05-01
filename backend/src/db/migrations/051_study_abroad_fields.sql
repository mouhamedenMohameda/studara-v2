-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 051 — Study abroad fields (programs + scholarship flag)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add "program" as a type (formations)
DO $$ BEGIN
  ALTER TYPE opportunity_type ADD VALUE IF NOT EXISTS 'program';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS has_scholarship BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scholarship_details TEXT;

