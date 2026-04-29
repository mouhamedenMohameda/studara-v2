-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 037 — AI Summary pricing inputs (pages + words) + wallet feature
--
-- Goal: allow server-side pricing for course summaries based on:
--   - extracted_page_count (PDF pages)
--   - extracted_word_count (words extracted from PDF text)
--
-- Also ensures premium_features contains 'ai_summary' so PAYG wallets can be used.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS extracted_page_count INT,
  ADD COLUMN IF NOT EXISTS extracted_word_count INT;

COMMENT ON COLUMN resources.extracted_page_count IS 'PDF page count (from pdf-parse) used for pricing and UX.';
COMMENT ON COLUMN resources.extracted_word_count IS 'Extracted word count (after whitespace normalization) used for pricing and UX.';

INSERT INTO premium_features (
  key, label_ar, label_fr,
  description_ar, description_fr,
  price_mru, duration_days,
  sort_order, is_active
) VALUES (
  'ai_summary',
  'ملخص ذكي (PDF)',
  'Résumé IA (PDF)',
  'تلخيص الدروس والملفات (PDF/Word) تلقائياً مع تسعير حسب الحجم',
  'Résumé automatique de cours (PDF/Word) avec tarification selon la taille',
  200,
  180,
  4,
  true
) ON CONFLICT (key) DO UPDATE
  SET label_ar       = EXCLUDED.label_ar,
      label_fr       = EXCLUDED.label_fr,
      description_ar = EXCLUDED.description_ar,
      description_fr = EXCLUDED.description_fr,
      is_active      = true;

