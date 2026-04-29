import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Text } from '@/ui/Text';
import { Colors, BorderRadius, Shadows, Spacing } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

export type FeatureCardProps = {
  title: string;
  description?: string;
  badgeText?: string;
  left?: React.ReactNode;
  gradientColors: readonly [string, string] | readonly [string, string, ...string[]];
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  width?: number;
  testID?: string;
};

export const FeatureCard = memo(function FeatureCard({
  title,
  description,
  badgeText,
  left,
  gradientColors,
  disabled,
  onPress,
  style,
  width,
  testID,
}: FeatureCardProps) {
  const { isDark } = useTheme();

  const a11yLabel = useMemo(() => {
    const parts = [title, description, badgeText].filter(Boolean);
    return parts.join('. ');
  }, [title, description, badgeText]);

  const outerStyle = useMemo<ViewStyle>(
    () => [
      styles.wrap,
      width ? { width } : null,
      disabled ? { opacity: 0.7 } : null,
      style,
    ] as any,
    [width, disabled, style],
  );

  return (
    <Pressable
      testID={testID}
      style={outerStyle}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: !!disabled }}
    >
      <LinearGradient
        colors={gradientColors as string[]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Decorative layers */}
        <View pointerEvents="none" style={styles.decorWrap}>
          <View style={[styles.glass, isDark && { opacity: 0.12 }]} />
          <View style={styles.blobA} />
          <View style={styles.blobB} />
          <View style={styles.blobC} />
        </View>

        {/* Border stroke */}
        <View
          pointerEvents="none"
          style={[
            styles.stroke,
            { borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.28)' },
          ]}
        />

        {badgeText ? (
          <View style={styles.badgeWrap} pointerEvents="none">
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        ) : null}

        <View style={styles.row}>
          {left ? <View style={styles.left}>{left}</View> : null}
          <View style={{ flex: 1, minWidth: 0, paddingRight: badgeText ? 52 : 0 }}>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
              {title}
            </Text>
            {!!description && (
              <Text style={styles.desc} numberOfLines={2}>
                {description}
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: 'hidden',
    ...Shadows.lg,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  gradient: {
    minHeight: 96,
    padding: 16,
    borderRadius: 24,
    position: 'relative',
    justifyContent: 'center',
  },
  decorWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  glass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.10)',
    opacity: 0.18,
  },
  blobA: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 999,
    top: -90,
    right: -70,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  blobB: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 999,
    bottom: -120,
    left: -120,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  blobC: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 999,
    bottom: -30,
    right: 18,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  stroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
  },
  badgeWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.40)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  left: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  desc: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 15,
  },
});

