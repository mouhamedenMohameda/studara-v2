import { StyleSheet, StyleProp, TextStyle } from 'react-native';
import { AppFontFaces, fontFamilyForWeight } from '../theme/fonts';

/**
 * Resolves `fontFamily` for Tajawal (or whatever is configured in `fonts.ts`).
 * Preserves an explicit `fontFamily` when no `fontWeight` is set.
 */
export function applyAppFont(style: StyleProp<TextStyle>): TextStyle {
  if (style == null || style === false) {
    return { fontFamily: AppFontFaces.regular };
  }
  const flat = StyleSheet.flatten(style) as TextStyle;
  const { fontWeight, fontFamily, ...rest } = flat;

  if (fontWeight != null && String(fontWeight) !== 'undefined') {
    return { ...rest, fontFamily: fontFamilyForWeight(fontWeight) };
  }
  if (fontFamily) {
    return { ...rest, fontFamily };
  }
  return { ...rest, fontFamily: AppFontFaces.regular };
}
