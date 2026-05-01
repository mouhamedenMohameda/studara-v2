/**
 * Studara — Education-app inspired palette (référence maquette utilisateur)
 *
 * Vert forêt profond (CTA / barre d’état), verts sauge et citron pour les accents,
 * fonds blanc cassé très doux, cartes très arrondies (tokens radius/shadow séparément).
 */

export const Colors = {
  // ─── Brand — vert forêt (primary buttons, FAB, barre d’onglets) ──────────────
  primary:        '#166534', // green-800 — forêt lisible sur blanc
  primaryLight:   '#22C55E', // green-500 — accents / icônes actives sur barre sombre
  primaryDark:    '#14532D', // green-900
  primaryDeep:    '#052E16',
  primarySurface: '#DCFCE7', // green-100 — pastilles actives sur fond clair
  primarySoft:    '#BBF7D0', // green-200

  // ─── Accent — citron sauge — petits badges / mise en évidence ──────────────
  accent:         '#84CC16', // lime-500
  accentLight:    '#D9F99D',
  accentDark:     '#65A30D',
  accentSurface:  '#F7FEE7',

  // ─── Secondary (ambre pour contraste chaud rare) ─────────────────────────────
  secondary:        '#F59E0B',
  secondaryLight:   '#FCD34D',
  secondaryDark:    '#D97706',
  secondarySurface: '#FFFBEB',

  // ─── Hero gradient — sauge lumineux → forêt ───────────────────────────────────
  heroFrom: '#4ADE80', // green-400
  heroMid:  '#22C55E', // green-500
  heroTo:   '#14532D', // green-900

  // ─── Semantic ────────────────────────────────────────────────────────────────
  success:        '#16A34A',
  successSurface: '#DCFCE7',
  warning:        '#D97706',
  warningSurface: '#FFFBEB',
  error:          '#DC2626',
  errorSurface:   '#FEF2F2',
  info:           '#0EA5E9',
  infoSurface:    '#F0F9FF',

  // ─── Neutrals — blanc cassé type “education app” ─────────────────────────────
  white:          '#FFFFFF',
  black:          '#000000',
  background:     '#FAFAF9',
  surface:        '#FFFFFF',
  surfaceWarm:    '#F5F9F7',
  surfaceVariant: '#ECFDF3',
  border:         '#E2E8E4',
  borderLight:    '#F1F5F4',
  divider:        '#E7EEEA',

  // ─── Text ────────────────────────────────────────────────────────────────────
  textPrimary:    '#14221A',
  textSecondary:  '#52635A',
  textMuted:      '#8FA398',
  textLight:      '#CBD5D0',
  textInverse:    '#FFFFFF',

  // ─── Module tags — pastels harmonisés au vert ───────────────────────────────
  modules: {
    resources:  '#15803D',
    timetable:  '#0369A1',
    flashcards: '#059669',
    jobs:       '#CA8A04',
    reminders:  '#DB2777',
    profile:    '#7C3AED',
    groups:     '#22C55E',
    housing:    '#EA580C',
    news:       '#4F46E5',
  },

  // ─── Tab bar — barre flottante foncée (maquette) ─────────────────────────────
  tabActive:     '#DCFCE7',
  tabInactive:   'rgba(255,255,255,0.48)',
  tabBackground: '#14532D',

  // ─── Overlays ────────────────────────────────────────────────────────────────
  overlay:       'rgba(5,46,22,0.48)',
  overlayLight:  'rgba(5,46,22,0.10)',
};

export const DarkColors: typeof Colors = {
  ...Colors,
  background:     '#07140D',
  surface:        '#0F2318',
  surfaceWarm:    '#0F2318',
  surfaceVariant: '#142E20',
  border:         '#1F4D32',
  borderLight:    '#163827',
  divider:        '#1F4D32',
  textPrimary:    '#ECFDF5',
  textSecondary:  '#ADC4B9',
  textMuted:      '#759385',
  textLight:      '#3D5E4C',
  textInverse:    '#052E16',
  tabBackground:  '#0A1F13',
  tabActive:      '#BBF7D0',
  tabInactive:    'rgba(255,255,255,0.40)',
  overlay:        'rgba(0,0,0,0.76)',
  overlayLight:   'rgba(0,0,0,0.40)',
  primarySurface: '#052E14',
  primarySoft:    '#14532D',
  accentSurface:  '#1A2E05',
  successSurface: '#052E14',
  warningSurface: '#2A2105',
  errorSurface:   '#2A0F0F',
  infoSurface:    '#082636',
  secondarySurface: '#2A2108',
};

// ─── Gradients ─────────────────────────────────────────────────────────────────
export const Gradients = {
  /** Bannières / héros — citron sauge vers forêt */
  brand:       ['#86EFAC', '#22C55E', '#14532D'] as const,
  /** Surfaces douces sous cartes */
  brandSoft:   ['#FFFFFF', '#ECFDF3'] as const,
  /** Monochrome hero (liste “violet” historique du code) */
  violet:      ['#BBF7D0', '#166534', '#14532D'] as const,
  sunrise:     ['#FDE68A', '#84CC16'] as const,
  sunset:      ['#FACC15', '#EA580C', '#BE123C'] as const,
  ocean:       ['#22C55E', '#0EA5E9', '#1D4ED8'] as const,
  emerald:     ['#86EFAC', '#16A34A', '#14532D'] as const,
  gold:        ['#FDE68A', '#D97706', '#92400E'] as const,
  dark:        ['rgba(0,0,0,0)', 'rgba(5,46,22,0.82)'] as const,
  glass:       ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.06)'] as const,
  cardLift:    ['#FFFFFF', '#F5F9F7'] as const,
};
