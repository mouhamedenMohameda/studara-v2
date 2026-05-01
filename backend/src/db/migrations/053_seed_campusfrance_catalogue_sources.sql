-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 053 — Seed Campus France catalogue sources (master/licence)
-- ─────────────────────────────────────────────────────────────────────────────

-- The scraper currently supports scraping a single program URL directly
-- (hash-route: #/program/:id). Seed the exact Master link requested by the user.
INSERT INTO opportunity_sources (name, base_url, list_url, parser, is_active, notes) VALUES
  (
    'Campus France Catalogue (master) — programme 717106721',
    'https://cataloguelm.campusfrance.org/master/',
    'https://cataloguelm.campusfrance.org/master/#/program/717106721',
    'generic_html',
    TRUE,
    'Scrape direct programme URL via ws/getmasterformjson.php?id=...'
  ),
  (
    'Campus France Catalogue (master) — tout le catalogue',
    'https://cataloguelm.campusfrance.org/master/',
    'https://cataloguelm.campusfrance.org/master/#/catalog?lang=fr',
    'generic_html',
    TRUE,
    'keywords=mas,pro,ing,eco,inf,par,ent,eur,bio,art,med'
  ),
  (
    'Campus France Catalogue (licence) — tout le catalogue',
    'https://cataloguelm.campusfrance.org/licence/',
    'https://cataloguelm.campusfrance.org/licence/#/catalog?lang=fr',
    'generic_html',
    TRUE,
    'keywords=lic,pro,ing,eco,inf,par,ent,eur,bio,art,med'
  ),
  (
    'Campus France Catalogue (licence) — à configurer',
    'https://cataloguelm.campusfrance.org/licence/',
    'https://cataloguelm.campusfrance.org/licence/#/program/0',
    'generic_html',
    FALSE,
    'Mettre ici une URL licence valide: https://cataloguelm.campusfrance.org/licence/#/program/{id}'
  )
ON CONFLICT (list_url) DO NOTHING;

