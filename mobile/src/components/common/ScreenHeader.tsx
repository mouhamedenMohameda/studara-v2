/**
 * ScreenHeader — Unified header for inner screens.
 *
 * Features:
 *  - Back button (optional)
 *  - Title + subtitle
 *  - Optional right-side icon button or gradient action
 *  - Optional gradient background (hero mode)
 *  - Safe-area aware
 */
import React from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, BorderRadius, Gradients } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightIcon?: AppIconName;
  onRightPress?: () => void;
  variant?: 'plain' | 'gradient' | 'solid';
  rtl?: boolean;
  style?: ViewStyle;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightIcon,
  onRightPress,
  variant = 'plain',
  rtl = true,
  style,
}) => {
  const { colors: C } = useTheme();

  const content = (
    <View style={[styles.row, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[
            styles.iconBtn,
            variant === 'gradient'
              ? { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.32)' }
              : { backgroundColor: C.surfaceVariant, borderColor: C.border },
          ]}
          activeOpacity={0.8}
        >
          <AppIcon
            name={rtl ? 'chevronForward' : 'chevronBack'}
            size={22}
            color={variant === 'gradient' ? '#FFFFFF' : C.textPrimary}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}

      <View style={[styles.textBlock, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            {
              color: variant === 'gradient' ? '#FFFFFF' : C.textPrimary,
              textAlign: rtl ? 'right' : 'left',
            },
          ]}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text
            numberOfLines={1}
            style={[
              styles.subtitle,
              {
                color: variant === 'gradient' ? 'rgba(255,255,255,0.85)' : C.textSecondary,
                textAlign: rtl ? 'right' : 'left',
              },
            ]}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {rightIcon && onRightPress ? (
        <TouchableOpacity
          onPress={onRightPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[
            styles.iconBtn,
            variant === 'gradient'
              ? { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.32)' }
              : { backgroundColor: C.surfaceVariant, borderColor: C.border },
          ]}
          activeOpacity={0.8}
        >
          <AppIcon
            name={rightIcon}
            size={20}
            color={variant === 'gradient' ? '#FFFFFF' : C.textPrimary}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}
    </View>
  );

  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={Gradients.brand as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[{ paddingBottom: Spacing.base }, style]}
      >
        <SafeAreaView edges={['top']}>{content}</SafeAreaView>
      </LinearGradient>
    );
  }

  if (variant === 'solid') {
    return (
      <View style={[{ backgroundColor: C.surface, paddingBottom: Spacing.sm }, style]}>
        <SafeAreaView edges={['top']}>{content}</SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[{ backgroundColor: C.background }, style]}>
      {content}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconPlaceholder: { width: 40, height: 40 },
  textBlock: { flex: 1, justifyContent: 'center' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default ScreenHeader;
