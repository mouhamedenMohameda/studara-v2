/**
 * Studara — Typography tokens (v2)
 *
 * Slightly larger display sizes and heavier display weights (800/900) for the
 * vibrant Gen-Z aesthetic (tight letter-spacing on hero headlines).
 *
 * Font faces come from `fonts.ts` (swap the family there).
 */

import { fontFamilyForWeight } from './fonts';

export const Typography = {
  sizes: {
    xs:  12,
    sm:  14,
    base: 16,
    md:  18,
    lg:  20,
    xl:  23,
    '2xl': 28,
    '3xl': 32,
    '4xl': 38,
    '5xl': 46,
    '6xl': 56,
  },
  weights: {
    light:    '300' as const,
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
    extrabold:'800' as const,
    black:    '900' as const,
  },
  styles: {
    // Display — hero screens
    display:   { fontSize: 46, fontFamily: fontFamilyForWeight('900'), letterSpacing: -1.2, lineHeight: 51 },
    displaySm: { fontSize: 38, fontFamily: fontFamilyForWeight('900'), letterSpacing: -1.0, lineHeight: 43 },
    // Headings
    h1: { fontSize: 32, fontFamily: fontFamilyForWeight('800'), letterSpacing: -0.6, lineHeight: 38 },
    h2: { fontSize: 28, fontFamily: fontFamilyForWeight('800'), letterSpacing: -0.5, lineHeight: 34 },
    h3: { fontSize: 23, fontFamily: fontFamilyForWeight('700'), letterSpacing: -0.3, lineHeight: 30 },
    h4: { fontSize: 20, fontFamily: fontFamilyForWeight('700'), letterSpacing: -0.2, lineHeight: 27 },
    h5: { fontSize: 18, fontFamily: fontFamilyForWeight('700'), letterSpacing: -0.1, lineHeight: 25 },
    // Body
    subtitle:  { fontSize: 18, fontFamily: fontFamilyForWeight('600'), lineHeight: 26 },
    body:      { fontSize: 16, fontFamily: fontFamilyForWeight('400'), lineHeight: 24 },
    bodyBold:  { fontSize: 16, fontFamily: fontFamilyForWeight('700'), lineHeight: 24 },
    bodySmall: { fontSize: 14, fontFamily: fontFamilyForWeight('400'), lineHeight: 22 },
    caption:   { fontSize: 12, fontFamily: fontFamilyForWeight('600'), letterSpacing: 0.4 },
    overline:  { fontSize: 12, fontFamily: fontFamilyForWeight('800'), letterSpacing: 1.2, textTransform: 'uppercase' as const },
    label:     { fontSize: 14, fontFamily: fontFamilyForWeight('700'), letterSpacing: 0.2 },
    button:    { fontSize: 16, fontFamily: fontFamilyForWeight('700'), letterSpacing: 0.2 },
    buttonSmall: { fontSize: 14, fontFamily: fontFamilyForWeight('700'), letterSpacing: 0.2 },
    buttonLarge: { fontSize: 18, fontFamily: fontFamilyForWeight('800'), letterSpacing: 0.2 },
  },
};
