/**
 * LogoMark — Studara Brand Identity (v2, vibrant Gen-Z)
 *
 * Icon:     violet-gradient rounded square with bold "S", tilted orbit ring,
 *           and a hot-pink planet dot.
 * Wordmark: violet "S" + primary-ink "tudara".
 *
 * Built 100% from React Native primitives + expo-linear-gradient.
 */

import React from 'react';
import { Text } from '@/ui/Text';
import { View, StyleSheet } from 'react-native';
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
  sm: { box:  44, orbitW: 40, orbitScaleY: 0.32, letter: 25, text: 13, radius: 12, planet: 3.2, planetTop:  5, planetRight:  6 },
  md: { box:  64, orbitW: 58, orbitScaleY: 0.32, letter: 37, text: 18, radius: 17, planet: 4.5, planetTop:  8, planetRight:  8 },
  lg: { box:  88, orbitW: 80, orbitScaleY: 0.32, letter: 51, text: 24, radius: 22, planet: 6,   planetTop: 11, planetRight: 11 },
  xl: { box: 114, orbitW: 104,orbitScaleY: 0.32, letter: 66, text: 30, radius: 28, planet: 8,   planetTop: 14, planetRight: 14 },
};

// Violet → pink gradient for the mark body
const BG_DARK:  [string, string, string] = ['#5B21B6', '#7C3AED', '#A78BFA'];
const BG_LIGHT: [string, string]         = ['#F5F3FF', '#EDE9FE'];
const BG_BRAND: [string, string, string] = ['#8B5CF6', '#EC4899', '#F97316'];

export function LogoMark({
  size      = 'md',
  showName  = true,
  nameColor,
  variant   = 'dark',
}: LogoMarkProps) {
  const s = SIZES[size];

  const bgColors     = (variant === 'light' ? BG_LIGHT : variant === 'brand' ? BG_BRAND : BG_DARK) as unknown as [string, string, ...string[]];
  const sColor       = variant === 'light' ? '#7C3AED' : '#FFFFFF';
  const orbitColor   = variant === 'light' ? 'rgba(124,58,237,0.45)' : 'rgba(255,255,255,0.55)';
  const planetColor  = variant === 'light' ? '#EC4899' : '#FDE68A';
  const resolvedName = nameColor ?? (variant === 'light' ? '#0F0A1F' : '#FFFFFF');

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={bgColors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.box, { width: s.box, height: s.box, borderRadius: s.radius }]}
      >
        {/* Orbit ring — circle compressed on Y axis then rotated */}
        <View
          pointerEvents="none"
          style={{
            position:     'absolute',
            width:        s.orbitW,
            height:       s.orbitW,
            borderRadius: s.orbitW / 2,
            borderWidth:  1.4,
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

        {/* Planet dot — top-right corner of orbit */}
        <View
          pointerEvents="none"
          style={[styles.planet, {
            width:           s.planet * 2,
            height:          s.planet * 2,
            borderRadius:    s.planet,
            backgroundColor: planetColor,
            top:             s.planetTop,
            right:           s.planetRight,
            shadowColor:     planetColor,
            shadowOpacity:   0.6,
            shadowRadius:    4,
            shadowOffset:    { width: 0, height: 0 },
          }]}
        />
      </LinearGradient>

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
  root: { alignItems: 'center', gap: 10 },
  box: {
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  sLetter: {
    fontWeight:         '900',
    includeFontPadding: false,
    backgroundColor:    'transparent',
    letterSpacing:      -1,
  },
  planet: { position: 'absolute' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-end' },
  wS:    { fontWeight: '900', letterSpacing: -0.6, includeFontPadding: false },
  wRest: { fontWeight: '800', letterSpacing: -0.6, includeFontPadding: false },
});
