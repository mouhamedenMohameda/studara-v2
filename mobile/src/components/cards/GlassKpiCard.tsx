import React, { memo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';

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
  return (
    <Pressable
      testID={testID}
      style={[styles.wrap, style, disabled && { opacity: 0.7 }]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.iconBox}>
        <AppIcon name={icon} size={16} color="#fff" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.value}>{value}</Text>
        <Text
          style={[styles.label, rtl && styles.rtlText]}
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
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.6,
    lineHeight: 22,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.86)',
    marginTop: 2,
    lineHeight: 13,
  },
});

