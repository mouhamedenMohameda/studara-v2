-- ─── Migration 003 : add semester column to resources ────────────────────────
-- semester = 1 (S1) or 2 (S2) ; nullable for backward-compat with old rows

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS semester SMALLINT CHECK (semester BETWEEN 1 AND 2);

CREATE INDEX IF NOT EXISTS idx_resources_semester ON resources(semester);
