import React, { memo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { useTheme } from '@/context/ThemeContext';
import { BorderRadius, Shadows } from '@/theme';

export type GlassKpiCardProps = {
  icon: AppIconName;
  value: React.ReactNode;
  label: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
  rtl?: boolean;
};

export const GlassKpiCard = memo(function GlassKpiCard({
  icon,
  value,
  label,
  onPress,
  disabled,
  style,
  testID,
  rtl,
}: GlassKpiCardProps) {
  const { colors: C } = useTheme();

  return (
    <Pressable
      testID={testID}
      style={[
        styles.wrap,
        {
          backgroundColor: C.surfaceVariant,
          borderColor: C.borderLight,
        },
        style,
        disabled && { opacity: 0.6 },
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={[styles.iconBox, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}>
        <AppIcon name={icon} size={16} color={C.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.value, { color: C.textPrimary }]}>{value}</Text>
        <Text
          style={[styles.label, { color: C.textMuted }, rtl && styles.rtlText]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  rtlText: {
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  wrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    ...Shadows.xs,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 22,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
    lineHeight: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
});
