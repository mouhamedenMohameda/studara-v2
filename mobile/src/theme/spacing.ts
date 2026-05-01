/**
 * Studara — Spacing, radius & shadows (Soft UI)
 *
 * Generous radius (rounded cards ~24px), pill tokens, diffuse low-contrast shadows.
 */

export const Spacing = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24,
  '2xl': 32, '3xl': 40, '4xl': 48, '5xl': 64, '6xl': 80,
};

export const BorderRadius = {
  xs:  10,
  sm:  14,
  md:  18,
  lg:  22,
  xl:  26,
  '2xl': 30,
  '3xl': 36,
  full:  9999,
  card:  24,
  modal: 28,
  pill:  9999,
};

/** Soft diffuse shadows — low opacity, blurred (e‑commerce mock style). */
export const Shadows = {
  none: { shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  xs:  { shadowColor: '#111827', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6,  elevation: 1 },
  sm:  { shadowColor: '#111827', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  md:  { shadowColor: '#111827', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 4 },
  lg:  { shadowColor: '#111827', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 28, elevation: 8 },
  xl:  { shadowColor: '#111827', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.09, shadowRadius: 40, elevation: 12 },

  brand:    { shadowColor: '#14532D', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.20, shadowRadius: 22, elevation: 8 },
  accent:   { shadowColor: '#FB7185', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.20, shadowRadius: 18, elevation: 6 },
  sunset:   { shadowColor: '#FB923C', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 6 },
  emerald:  { shadowColor: '#10B981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.20, shadowRadius: 18, elevation: 6 },
  gold:     { shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.20, shadowRadius: 16, elevation: 6 },

  primary: { shadowColor: '#166534', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.20, shadowRadius: 22, elevation: 8 },
};
