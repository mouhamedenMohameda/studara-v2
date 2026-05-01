/**
 * Spatial rhythm — Soft UI shells (margins align across all screens).
 */
export const Layout = {
  /** Horizontal gutter for stacked content beneath a chrome header */
  screenPaddingX: 20,
  screenPaddingLG: 24,
  /** Vertical rhythm between stacked sections */
  sectionGapY: 20,
  /** Minimum tap target aligned with WCAG-ish mobile patterns */
  minTapTarget: 44,
  /** Réserve basse typique si tu n’utilises pas le hook (fallback) */
  tabBarContentFallback: 120,
} as const;
