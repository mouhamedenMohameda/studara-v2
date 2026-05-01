-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 052 — Program level + duration (Campus France catalogue)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS program_level TEXT,
  ADD COLUMN IF NOT EXISTS program_duration_text TEXT,
  ADD COLUMN IF NOT EXISTS program_duration_months INTEGER;

