/**
 * Point de bascule unique entre familles d’icônes.
 *
 * - `'phosphor'` — Phosphor (défaut, style plus pro et cohérent).
 * - `'ionicons'` — Ionicons (@expo/vector-icons), utile en secours / comparaison.
 *
 * Pour revenir à Ionicons : change uniquement la constante ci-dessous.
 */
export type IconPackId = 'phosphor' | 'ionicons';

export const ACTIVE_ICON_PACK: IconPackId = 'phosphor';

/** Facteur appliqué à toutes les tailles passées à `<AppIcon size={…} />` (icônes un peu plus grandes). */
export const APP_ICON_SIZE_SCALE = 1.12;
