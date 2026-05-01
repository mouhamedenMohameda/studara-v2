-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 054 — Prevent duplicates by official_url
-- ─────────────────────────────────────────────────────────────────────────────

-- official_url is stable for Campus France catalogue (#/program/:id) and helps
-- deduplicate even when apply_url differs across sources.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_opportunities_official_url
  ON opportunities (official_url);

