import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  SafeAreaView,
  type Edge,
  type SafeAreaViewProps,
} from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { Layout } from '@/theme/layout';

export type ScreenProps = {
  children: React.ReactNode;
  edges?: SafeAreaViewProps['edges'];
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * Roots a screen with the correct ambient background & safe-area insets.
 * Use `padded` for centered column layouts with standard horizontal gutters.
 */
export function Screen({
  children,
  edges = ['top', 'left', 'right', 'bottom'],
  padded = false,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const { colors } = useTheme();

  const innerPad = padded
    ? { paddingHorizontal: Layout.screenPaddingX }
    : undefined;

  return (
    <SafeAreaView
      edges={edges as Edge[]}
      style={[styles.flex, { backgroundColor: colors.background }, style]}
    >
      <View style={[styles.flex, innerPad, contentContainerStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
