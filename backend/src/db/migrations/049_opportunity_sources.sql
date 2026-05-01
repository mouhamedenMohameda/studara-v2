-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 049 — Opportunity sources (sites to scrape)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS opportunity_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  base_url     TEXT NOT NULL,
  list_url     TEXT NOT NULL,
  parser       VARCHAR(40) NOT NULL DEFAULT 'generic_html' CHECK (parser IN ('generic_html', 'rss')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_ms INTEGER NOT NULL DEFAULT 700,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_opportunity_sources_list_url ON opportunity_sources(list_url);

DO $$ BEGIN
  CREATE TRIGGER trg_opportunity_sources_updated
  BEFORE UPDATE ON opportunity_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Seed a few placeholders (idempotent). Replace/extend from admin later.
INSERT INTO opportunity_sources (name, base_url, list_url, parser, is_active, notes) VALUES
  ('Erasmus Mundus (listing)', 'https://www.eacea.ec.europa.eu', 'https://www.eacea.ec.europa.eu/scholarships/emjmd-catalogue_en', 'generic_html', TRUE, 'Generic HTML parser (may need tuning)'),
  ('Campus France (bourses)',  'https://www.campusfrance.org',  'https://www.campusfrance.org/fr/bourses-etudiants-etrangers', 'generic_html', TRUE, 'Generic HTML parser (may need tuning)')
ON CONFLICT (list_url) DO NOTHING;

