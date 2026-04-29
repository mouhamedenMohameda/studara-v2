-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 045 — Backfill provider_cost_mru for AI document debits (best-effort)
--
-- Fills `feature_transactions.provider_cost_mru` for historical rows where it is NULL,
-- based on the human-readable `description` we already store.
--
-- This targets:
-- - Résumé intelligent — <file> (<N> mots, <basis>) ...
-- - Résumé IA — <pages> pages, <N> mots (<basis>)
-- - Correction IA — <pages> p., <N> mots (<basis>)
--
-- Provider cost policy (same as in aiDocumentPricing.ts):
--   provider/page = 0.02 MRU
--   provider/1k words = 0.04 MRU
--   provider cost is NOT ceiled and has no minimum.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Backfill rows that include word count in the description
WITH candidates AS (
  SELECT
    id,
    description,
    NULLIF((regexp_match(description, '([0-9]+)\\s*mots'))[1], '')::numeric AS word_count,
    NULLIF((regexp_match(description, '([0-9]+)\\s*pages?'))[1], '')::numeric AS page_count,
    NULLIF((regexp_match(description, '([0-9]+)\\s*p\\.,'))[1], '')::numeric AS page_count_p
  FROM feature_transactions
  WHERE type = 'debit'
    AND provider_cost_mru IS NULL
    AND (
      description ILIKE 'Résumé intelligent — %'
      OR description ILIKE 'Résumé IA — %'
      OR description ILIKE 'Correction IA — %'
    )
),
calc AS (
  SELECT
    id,
    COALESCE(page_count, page_count_p) AS pages,
    word_count AS words
  FROM candidates
)
UPDATE feature_transactions ft
SET provider_cost_mru =
  ROUND(
    GREATEST(
      COALESCE(calc.pages, 0) * 0.02,
      COALESCE(calc.words, 0) / 1000.0 * 0.04
    )::numeric
  , 4)
FROM calc
WHERE ft.id = calc.id
  AND (calc.pages IS NOT NULL OR calc.words IS NOT NULL);

