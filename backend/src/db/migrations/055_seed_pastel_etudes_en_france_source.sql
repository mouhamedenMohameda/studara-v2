-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 055 — Seed Pastel "Études en France" catalogue source
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO opportunity_sources (name, base_url, list_url, parser, is_active, notes) VALUES
  (
    'Études en France (Pastel) — Catalogue de formations',
    'https://pastel.diplomatie.gouv.fr/etudesenfrance/',
    'https://pastel.diplomatie.gouv.fr/etudesenfrance/dyn/public/pageCatalogueFormation.html',
    'generic_html',
    TRUE,
    'Scrape examinerFormation links; requires JS redirect support for jsessionid/sctxid.'
  )
ON CONFLICT (list_url) DO NOTHING;

