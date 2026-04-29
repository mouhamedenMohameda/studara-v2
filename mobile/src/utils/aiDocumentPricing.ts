/**
 * Mirror of backend `aiDocumentPricing.ts` — keep formulas in sync.
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
      ? 1
      : Math.max(pagesPrice ?? 0, wordsPrice ?? 0);

  let priceMru = Math.max(1, Math.ceil(raw));

  if (pageCount && pageCount <= 50) priceMru = Math.min(priceMru, 2);

  const basis: 'pages' | 'words' | 'fallback' =
    pagesPrice == null && wordsPrice == null
      ? 'fallback'
      : (pagesPrice ?? 0) >= (wordsPrice ?? 0)
        ? 'pages'
        : 'words';

  return { priceMru, basis };
}

export function countWordsFrText(s: string): number {
  const cleaned = String(s || '')
    .split('\u0000').join(' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}
