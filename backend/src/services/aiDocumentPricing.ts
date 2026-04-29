/**
 * Shared MRU pricing for document-heavy AI (résumés cours, correction d'exercices).
 * Règle: max(pages×0.04, mots/1000×0.08), arrondi au palier de 0.2 MRU (vers le haut).
 * Pas de plafond.
 */

export function estimateAiSummaryPriceMru(params: {
  pageCount: number | null;
  wordCount: number;
}): { priceMru: number; basis: 'pages' | 'words' | 'fallback' } {
  const { pageCount, wordCount } = params;

  const perPageMru = 0.04;
  const per1kWordsMru = 0.08;

  const pagesPrice = typeof pageCount === 'number' && pageCount > 0 ? pageCount * perPageMru : null;
  const wordsPrice = wordCount > 0 ? (wordCount / 1000) * per1kWordsMru : null;

  const raw =
    pagesPrice == null && wordsPrice == null
      ? 0.2
      : Math.max(pagesPrice ?? 0, wordsPrice ?? 0);

  // Round UP to the next 0.2 MRU step (0.34 → 0.4, 0.41 → 0.6, 1.91 → 2.0).
  const step = 0.2;
  const roundUpStep = (x: number) => Math.ceil(x / step) * step;
  let priceMru = Math.max(step, roundUpStep(raw));

  // Keep 2 decimals at most (wallet stores NUMERIC(10,2)).
  priceMru = Math.round(priceMru * 100) / 100;

  const basis: 'pages' | 'words' | 'fallback' =
    pagesPrice == null && wordsPrice == null
      ? 'fallback'
      : (pagesPrice ?? 0) >= (wordsPrice ?? 0)
        ? 'pages'
        : 'words';

  return { priceMru, basis };
}

/**
 * Estimated provider cost (MRU) for document-heavy AI.
 * This is the "real cost" metric we want to track per transaction.
 *
 * Policy: our sell price rates are currently 2× the provider rates for this module:
 * - sell per page = 0.04 MRU  → provider per page = 0.02 MRU
 * - sell per 1k words = 0.08  → provider per 1k words = 0.04 MRU
 *
 * Important: provider cost is NOT rounded to integer and has no minimum.
 */
export function estimateAiSummaryProviderCostMru(params: {
  pageCount: number | null;
  wordCount: number;
}): { providerCostMru: number; basis: 'pages' | 'words' | 'fallback' } {
  const { pageCount, wordCount } = params;

  const perPageMru = 0.02;
  const per1kWordsMru = 0.04;

  const pagesCost = typeof pageCount === 'number' && pageCount > 0 ? pageCount * perPageMru : null;
  const wordsCost = wordCount > 0 ? (wordCount / 1000) * per1kWordsMru : null;

  const raw =
    pagesCost == null && wordsCost == null
      ? 0
      : Math.max(pagesCost ?? 0, wordsCost ?? 0);

  const basis: 'pages' | 'words' | 'fallback' =
    pagesCost == null && wordsCost == null
      ? 'fallback'
      : (pagesCost ?? 0) >= (wordsCost ?? 0)
        ? 'pages'
        : 'words';

  // Keep 4 decimals (DB column is NUMERIC(10,4)).
  const providerCostMru = Math.round(raw * 10_000) / 10_000;
  return { providerCostMru, basis };
}
