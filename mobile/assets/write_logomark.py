"""
Regenerate LogoMark.tsx and all PNG icon assets for Studara.

Design:  deep-navy rounded square  ·  bold "S" in sky-blue
         ·  one tilted orbit ring  ·  small planet dot.

Run:
    python3 assets/write_logomark.py
"""
import os

BASE = '/Users/mohameda/Desktop/studara'

# ── 1. Write LogoMark.tsx ────────────────────────────────────────────────────
LOGOMARK = r"""/**
 * LogoMark — Studara Official Brand Identity
 *
 * Icon:     deep-navy rounded square · bold "S" in sky-blue
 *           · one tilted orbit ring · small planet dot.
 * Wordmark: sky-blue "S" + white "tudara".
 *
 * Built 100% from React Native primitives + expo-linear-gradient.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Size    = 'sm' | 'md' | 'lg' | 'xl';
type Variant = 'dark' | 'light' | 'brand';

interface LogoMarkProps {
  size?:      Size;
  showName?:  boolean;
  nameColor?: string;
  variant?:   Variant;
}

const SIZES: Record<Size, {
  box: number; orbitW: number; orbitScaleY: number;
  letter: number; text: number; radius: number;
  planet: number; planetTop: number; planetRight: number;
}> = {
  sm: { box:  44, orbitW: 40, orbitScaleY: 0.32, letter: 25, text: 13, radius: 10, planet: 2.8, planetTop:  5, planetRight:  6 },
  md: { box:  64, orbitW: 58, orbitScaleY: 0.32, letter: 37, text: 18, radius: 15, planet: 4,   planetTop:  8, planetRight:  8 },
  lg: { box:  88, orbitW: 80, orbitScaleY: 0.32, letter: 51, text: 24, radius: 20, planet: 5.5, planetTop: 11, planetRight: 11 },
  xl: { box: 114, orbitW: 104,orbitScaleY: 0.32, letter: 66, text: 30, radius: 26, planet: 7,   planetTop: 14, planetRight: 14 },
};

const BG_DARK:  [string, string] = ['#0e1e30', '#060b12'];
const BG_LIGHT: [string, string] = ['#dbeafe', '#f0f9ff'];
const BG_BRAND: [string, string] = ['#0ea5e9', '#0369a1'];

export function LogoMark({
  size      = 'md',
  showName  = true,
  nameColor,
  variant   = 'dark',
}: LogoMarkProps) {
  const s = SIZES[size];

  const bgColors     = variant === 'light' ? BG_LIGHT : variant === 'brand' ? BG_BRAND : BG_DARK;
  const sColor       = variant === 'light' ? '#0369a1' : variant === 'brand' ? '#ffffff' : '#4facfe';
  const orbitColor   = variant === 'light' ? 'rgba(3,105,161,0.45)' : 'rgba(79,172,254,0.50)';
  const planetColor  = variant === 'light' ? '#0369a1' : '#e0f2fe';
  const resolvedName = nameColor ?? (variant === 'light' ? '#0369a1' : '#FFFFFF');

  return (
    <View style={styles.root}>

      {/* ── Icon ── */}
      <LinearGradient
        colors={bgColors}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={[styles.box, { width: s.box, height: s.box, borderRadius: s.radius }]}
      >
        {/* Orbit ring */}
        <View
          pointerEvents="none"
          style={{
            position:     'absolute',
            width:        s.orbitW,
            height:       s.orbitW,
            borderRadius: s.orbitW / 2,
            borderWidth:  1.2,
            borderColor:  orbitColor,
            transform:    [{ scaleY: s.orbitScaleY }, { rotate: '-28deg' }],
          }}
        />

        {/* S letterform */}
        <Text
          style={[styles.sLetter, { fontSize: s.letter, color: sColor }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          S
        </Text>

        {/* Planet dot */}
        <View
          pointerEvents="none"
          style={[styles.planet, {
            width:           s.planet * 2,
            height:          s.planet * 2,
            borderRadius:    s.planet,
            backgroundColor: planetColor,
            top:             s.planetTop,
            right:           s.planetRight,
          }]}
        />
      </LinearGradient>

      {/* ── Wordmark ── */}
      {showName && (
        <View style={styles.wordmarkRow}>
          <Text style={[styles.wS,    { fontSize: s.text, color: sColor }]}        allowFontScaling={false}>S</Text>
          <Text style={[styles.wRest, { fontSize: s.text, color: resolvedName }]}  allowFontScaling={false}>tudara</Text>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 8 },

  box: {
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },

  sLetter: {
    fontWeight:         '800',
    includeFontPadding: false,
    backgroundColor:    'transparent',
  },

  planet: { position: 'absolute' },

  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-end' },
  wS:    { fontWeight: '800', letterSpacing: -0.5, includeFontPadding: false },
  wRest: { fontWeight: '800', letterSpacing: -0.5, includeFontPadding: false },
});
"""

path = os.path.join(BASE, 'src/components/common/LogoMark.tsx')
with open(path, 'w', encoding='utf-8') as f:
    f.write(LOGOMARK)
print(f'✅ LogoMark.tsx written ({len(LOGOMARK)} chars)')


# ── 2. Generate logo PNG files via cairosvg ──────────────────────────────────
# Use the canonical logo.svg already in assets/
SVG = open(os.path.join(BASE, 'assets', 'logo.svg'), 'rb').read()

try:
    from cairosvg import svg2png
    assets = os.path.join(BASE, 'assets')

    svg2png(bytestring=SVG,
            write_to=os.path.join(assets, 'icon.png'),
            output_width=1024, output_height=1024)
    print('✅ icon.png (1024×1024)')

    svg2png(bytestring=SVG,
            write_to=os.path.join(assets, 'adaptive-icon.png'),
            output_width=1024, output_height=1024)
    print('✅ adaptive-icon.png (1024×1024)')

    svg2png(bytestring=SVG,
            write_to=os.path.join(assets, 'splash-icon.png'),
            output_width=512, output_height=512)
    print('✅ splash-icon.png (512×512)')

    svg2png(bytestring=SVG,
            write_to=os.path.join(assets, 'favicon.png'),
            output_width=48, output_height=48)
    print('✅ favicon.png (48×48)')

except Exception as e:
    print(f'⚠️  PNG generation skipped: {e}')

print('Done.')
