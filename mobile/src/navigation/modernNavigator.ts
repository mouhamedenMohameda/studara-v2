import { useMemo } from 'react';
import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import type { StackNavigationOptions } from '@react-navigation/stack';
import { useTheme } from '../context/ThemeContext';

/** Unified stack transitions + card surface (every stack in the app). */
export function useModernStackOptions(): StackNavigationOptions {
  const { colors: C } = useTheme();
  return useMemo(
    () => ({
      headerShown: false,
      cardStyle: { backgroundColor: C.background },
      cardOverlayEnabled: true,
      detachInactiveScreens: true,
      gestureEnabled: true,
    }),
    [C.background],
  );
}

/** React Navigation container theme driven by ThemeContext */
export function useAppNavigationTheme(): Theme {
  const { colors: C, isDark } = useTheme();
  return useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: C.primary,
        background: C.background,
        card: C.surface,
        text: C.textPrimary,
        border: C.border,
        notification: C.primary,
      },
    };
  }, [C, isDark]);
}
