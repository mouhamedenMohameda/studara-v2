/**
 * ThemeContext — Dark / Light / System mode
 *
 * Usage:
 *   const { colors: C, isDark, toggleTheme } = useTheme();
 *   <View style={{ backgroundColor: C.background }} />
 *   <Text style={{ color: C.textPrimary }} />
 *
 * The preference is persisted to AsyncStorage so it survives app restarts.
 * 'system' (default) follows the OS setting.
 */

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import { useColorScheme } from 'react-native';
import { Colors, DarkColors } from '../theme/colors';
import { getThemePreference, setThemePreference, ThemePreference } from '../utils/offlineStorage';

interface ThemeContextValue {
  /** The currently active color palette (light or dark). Use this everywhere. */
  colors: typeof Colors;
  /** true when dark mode is active */
  isDark: boolean;
  /** Stored preference: 'light' | 'dark' | 'system' */
  theme: ThemePreference;
  /** Toggle between light and dark (saves to storage) */
  toggleTheme: () => Promise<void>;
  /** Set a specific preference */
  setTheme: (pref: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [theme, setThemePref] = useState<ThemePreference>('system');

  // Load persisted preference on mount
  useEffect(() => {
    getThemePreference().then(setThemePref).catch(() => {});
  }, []);

  const isDark = useMemo(
    () => theme === 'dark' || (theme === 'system' && systemScheme === 'dark'),
    [theme, systemScheme],
  );

  const colors = isDark ? DarkColors : Colors;

  const setTheme = useCallback(async (pref: ThemePreference) => {
    setThemePref(pref);
    await setThemePreference(pref);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next: ThemePreference = isDark ? 'light' : 'dark';
    await setTheme(next);
  }, [isDark, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, isDark, theme, toggleTheme, setTheme }),
    [colors, isDark, theme, toggleTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
};
