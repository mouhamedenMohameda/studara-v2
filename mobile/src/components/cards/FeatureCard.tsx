import React, { memo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/ui/Text';
import { BorderRadius, Shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

export type FeatureCardProps = {
  title: string;
  description?: string;
  badgeText?: string;
  left?: React.ReactNode;
  /** Couleur d’accent (bordure gauche + halo icône) — sans dégradé. */
  accentColor: string;
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
  accentColor,
  disabled,
  onPress,
  style,
  width,
  testID,
}: FeatureCardProps) {
  const { colors: C } = useTheme();

  const a11yLabel = [title, description, badgeText].filter(Boolean).join('. ');

  return (
    <Pressable
      testID={testID}
      style={[
        styles.wrap,
        { backgroundColor: C.surface, borderColor: C.borderLight },
        width ? { width } : null,
        disabled ? { opacity: 0.65 } : null,
        style,
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      android_ripple={{ color: C.primarySoft }}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View pointerEvents="none" style={[styles.accentRail, { backgroundColor: accentColor }]} />

      {badgeText ? (
        <View style={[styles.badgeWrap, { backgroundColor: accentColor + '22', borderColor: accentColor + '44' }]} pointerEvents="none">
          <Text style={[styles.badgeText, { color: accentColor }]}>{badgeText}</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        {left ? (
          <View style={[styles.left, { backgroundColor: accentColor + '18', borderColor: accentColor + '30' }]}>{left}</View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, paddingRight: badgeText ? 12 : 0 }}>
          <Text style={[styles.title, { color: C.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
            {title}
          </Text>
          {!!description && (
            <Text style={[styles.desc, { color: C.textSecondary }]} numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    padding: 16,
    paddingLeft: 18,
    minHeight: 96,
    justifyContent: 'center',
    position: 'relative',
    ...Shadows.sm,
  },
  accentRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: BorderRadius.card,
    borderBottomLeftRadius: BorderRadius.card,
  },
  badgeWrap: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  desc: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    opacity: 0.92,
  },
});
