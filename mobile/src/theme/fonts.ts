/**
 * App-wide UI font — single swap point.
 *
 * To use another @expo-google-fonts family (e.g. Cairo):
 * 1. `npm i @expo-google-fonts/cairo`
 * 2. Replace the `import { … } from '@expo-google-fonts/tajawal'` block below.
 * 3. Set `AppFontFaces` string values to the new package’s PostScript names
 *    (same strings you pass as keys in `appFontSources`).
 * 4. Point `appFontSources` values to the new `require()` assets from that package.
 */

import type { TextStyle } from 'react-native';
import {
  Tajawal_200ExtraLight,
  Tajawal_300Light,
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
  Tajawal_800ExtraBold,
  Tajawal_900Black,
} from '@expo-google-fonts/tajawal';

/** Registered `fontFamily` names (must match keys in `appFontSources`). */
export const AppFontFaces = {
  extraLight: 'Tajawal_200ExtraLight',
  light: 'Tajawal_300Light',
  regular: 'Tajawal_400Regular',
  medium: 'Tajawal_500Medium',
  bold: 'Tajawal_700Bold',
  extraBold: 'Tajawal_800ExtraBold',
  black: 'Tajawal_900Black',
} as const;

/** Pass to `useFonts` from `expo-font`. */
export const appFontSources: Record<string, number> = {
  [AppFontFaces.extraLight]: Tajawal_200ExtraLight,
  [AppFontFaces.light]: Tajawal_300Light,
  [AppFontFaces.regular]: Tajawal_400Regular,
  [AppFontFaces.medium]: Tajawal_500Medium,
  [AppFontFaces.bold]: Tajawal_700Bold,
  [AppFontFaces.extraBold]: Tajawal_800ExtraBold,
  [AppFontFaces.black]: Tajawal_900Black,
};

const w = (weight: TextStyle['fontWeight'] | undefined): string =>
  weight == null ? '400' : String(weight);

/**
 * Maps numeric/fontWeight tokens to a loaded face. Tajawal has no 600 file — 600 → bold.
 */
export function fontFamilyForWeight(
  weight: TextStyle['fontWeight'] | undefined,
): (typeof AppFontFaces)[keyof typeof AppFontFaces] {
  const key = w(weight);
  if (key === '200') return AppFontFaces.extraLight;
  if (key === '300' || key === 'light') return AppFontFaces.light;
  if (key === '400' || key === 'normal' || key === 'regular') return AppFontFaces.regular;
  if (key === '500' || key === 'medium') return AppFontFaces.medium;
  if (key === '600' || key === 'semibold') return AppFontFaces.bold;
  if (key === '700' || key === 'bold') return AppFontFaces.bold;
  if (key === '800') return AppFontFaces.extraBold;
  if (key === '900' || key === 'black') return AppFontFaces.black;
  return AppFontFaces.regular;
}
