/**
 * Studara — Vibrant Gen-Z Palette (v2)
 *
 * Design language: bold gradients (violet → pink → sunset), colored shadows,
 * playful chips, creamy warm neutrals, generous contrast. Inspired by
 * Duolingo / Cal AI / Linear-vibrant.
 *
 * All existing keys are preserved so no screen needs to be updated to compile.
 */

export const Colors = {
  // ─── Brand (electric violet) ────────────────────────────────────────────────
  primary:        '#7C3AED', // violet-600 — main brand
  primaryLight:   '#A78BFA', // violet-400
  primaryDark:    '#5B21B6', // violet-800
  primaryDeep:    '#3B0764', // violet-950
  primarySurface: '#F5F3FF', // violet-50 — surfaces / chips
  primarySoft:    '#EDE9FE', // violet-100 — soft hover / rings

  // ─── Accent (hot pink / magenta) ────────────────────────────────────────────
  accent:         '#EC4899', // pink-500
  accentLight:    '#F472B6', // pink-400
  accentDark:     '#BE185D', // pink-700
  accentSurface:  '#FDF2F8', // pink-50

  // ─── Secondary (sunset orange) ──────────────────────────────────────────────
  secondary:        '#F97316', // orange-500
  secondaryLight:   '#FB923C', // orange-400
  secondaryDark:    '#C2410C', // orange-700
  secondarySurface: '#FFF7ED', // orange-50

  // ─── Hero gradient (purple → pink → sunset) ────────────────────────────────
  heroFrom: '#8B5CF6', // violet-500
  heroMid:  '#EC4899', // pink-500
  heroTo:   '#F97316', // orange-500

  // ─── Semantic ──────────────────────────────────────────────────────────────
  success:        '#10B981', // emerald-500
  successSurface: '#ECFDF5', // emerald-50
  warning:        '#F59E0B', // amber-500
  warningSurface: '#FFFBEB', // amber-50
  error:          '#F43F5E', // rose-500
  errorSurface:   '#FFF1F2', // rose-50
  info:           '#0EA5E9', // sky-500
  infoSurface:    '#F0F9FF', // sky-50

  // ─── Neutrals (warm, creamy) ───────────────────────────────────────────────
  white:          '#FFFFFF',
  black:          '#000000',
  background:     '#FAFAFB', // off-white, warm
  surface:        '#FFFFFF',
  surfaceWarm:    '#FAF7FF', // violet-tinted white
  surfaceVariant: '#F4F1FA', // subtle lavender-grey
  border:         '#ECE7F5', // faint violet-grey
  borderLight:    '#F4F1FA',
  divider:        '#EFEBF7',

  // ─── Text ──────────────────────────────────────────────────────────────────
  textPrimary:    '#0F0A1F', // near-black, deep ink
  textSecondary:  '#4A4458', // muted ink
  textMuted:      '#8C8599', // soft grey
  textLight:      '#CFC9D9',
  textInverse:    '#FFFFFF',

  // ─── Module tags (vibrant, distinct) ───────────────────────────────────────
  modules: {
    resources:  '#7C3AED', // violet
    timetable:  '#0EA5E9', // sky
    flashcards: '#06B6D4', // cyan
    jobs:       '#F97316', // orange
    reminders:  '#EC4899', // pink
    profile:    '#8B5CF6', // violet-500
    groups:     '#10B981', // emerald
    housing:    '#F59E0B', // amber
    news:       '#6366F1', // indigo
  },

  // ─── Tab bar ───────────────────────────────────────────────────────────────
  tabActive:     '#7C3AED',
  tabInactive:   '#8C8599',
  tabBackground: '#FFFFFF',

  // ─── Overlays ──────────────────────────────────────────────────────────────
  overlay:       'rgba(15,10,31,0.55)',
  overlayLight:  'rgba(15,10,31,0.22)',
};

export const DarkColors: typeof Colors = {
  ...Colors,
  background:     '#0A0714', // very deep violet-black
  surface:        '#14102A', // elevated
  surfaceWarm:    '#1A1535', // warmer elevated
  surfaceVariant: '#231C42',
  border:         '#2D2654',
  borderLight:    '#231C42',
  divider:        '#231C42',
  textPrimary:    '#F5F2FF',
  textSecondary:  '#BFB8D4',
  textMuted:      '#827C96',
  textLight:      '#4A4458',
  textInverse:    '#0F0A1F',
  tabBackground:  '#0A0714',
  overlay:        'rgba(0,0,0,0.78)',
  overlayLight:   'rgba(0,0,0,0.42)',
  primarySurface: '#1E1340',
  primarySoft:    '#2A1B54',
  accentSurface:  '#2A0F1F',
  successSurface: '#0A2218',
  warningSurface: '#2A1F00',
  errorSurface:   '#2A0D14',
  infoSurface:    '#061528',
  secondarySurface: '#2A1608',
};

// ─── Gradients ─────────────────────────────────────────────────────────────────
export const Gradients = {
  /** Main hero gradient — purple → pink → sunset (Gen-Z signature) */
  brand:       ['#8B5CF6', '#EC4899', '#F97316'] as const,
  /** Softer hero — violet → pink only */
  brandSoft:   ['#F5F3FF', '#FDF2F8'] as const,
  /** Violet monochrome */
  violet:      ['#A78BFA', '#7C3AED', '#5B21B6'] as const,
  /** Sunrise — warm yellow → pink */
  sunrise:     ['#FDE68A', '#F472B6'] as const,
  /** Sunset — pink → deep orange */
  sunset:      ['#F472B6', '#F97316', '#DC2626'] as const,
  /** Ocean — teal → sky */
  ocean:       ['#22D3EE', '#0EA5E9', '#6366F1'] as const,
  /** Emerald — green shades */
  emerald:     ['#34D399', '#10B981', '#047857'] as const,
  /** Gold — premium tier */
  gold:        ['#FDE68A', '#F59E0B', '#B45309'] as const,
  /** Dark — bottom scrim for photo overlays */
  dark:        ['rgba(0,0,0,0)', 'rgba(15,10,31,0.78)'] as const,
  /** Glass — for cards over hero */
  glass:       ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.08)'] as const,
  /** Card highlight — subtle violet lift */
  cardLift:    ['#FFFFFF', '#F5F3FF'] as const,
};
