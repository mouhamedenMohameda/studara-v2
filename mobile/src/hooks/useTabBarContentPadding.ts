import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Padding bas pour ScrollView / FlatList lorsque les écrans sont sous la barre d’onglets flottante.
 * `extra` : marge additionnelle (section locale, mini-player, etc.).
 */
export function useTabBarContentPadding(extra = 20): number {
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 8);
  // ~ hauteur barre flottante (72) + marge sous la barre + léger gap
  return safeBottom + 78 + extra;
}
