/**
 * Studara — Spacing, Radius & Shadow tokens (v2, vibrant Gen-Z)
 *
 * Radii are a bit chunkier (playful, Duolingo-esque), shadows have subtle
 * violet tint on brand surfaces. Keys are backward-compatible.
 */

export const Spacing = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24,
  '2xl': 32, '3xl': 40, '4xl': 48, '5xl': 64, '6xl': 80,
};

export const BorderRadius = {
  xs:  8,
  sm:  12,
  md:  16,
  lg:  20,
  xl:  24,
  '2xl': 28,
  '3xl': 36,
  full:  9999,
  card:  20,
  modal: 28,
  pill:  9999,
};

/** Colored/neutral shadows — Gen-Z tends to stack colored halos under brand surfaces. */
export const Shadows = {
  none: { shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  xs:  { shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,  elevation: 1 },
  sm:  { shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8,  elevation: 3 },
  md:  { shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 5 },
  lg:  { shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 28, elevation: 10 },
  xl:  { shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.18, shadowRadius: 40, elevation: 14 },

  // Colored glows
  brand:    { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 8 },
  accent:   { shadowColor: '#EC4899', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 18, elevation: 8 },
  sunset:   { shadowColor: '#F97316', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 8 },
  emerald:  { shadowColor: '#10B981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 8 },
  gold:     { shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.30, shadowRadius: 16, elevation: 8 },

  // Backward-compat alias
  primary: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 8 },
};
