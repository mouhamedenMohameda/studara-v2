/**
 * AccessibilityContext
 *
 * Provides a user-controlled font-scale preference that persists across
 * sessions via AsyncStorage.
 *
 *   - 'small'  → scale 0.87  (smaller text for more content on screen)
 *   - 'normal' → scale 1.00  (default)
 *   - 'large'  → scale 1.16  (easier reading)
 *
 * Usage:
 *   const { fontSize, fontScalePref, setFontScale } = useAccessibility();
 *   <Text style={{ fontSize: fontSize(14) }}>Hello</Text>
 */

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import {
  getFontScalePreference, setFontScalePreference, FontScale,
} from '../utils/offlineStorage';

/** Légère hausse globale du texte qui passe par `fontSize()` (préf. accessibilité inchangée en ratio). */
const GLOBAL_UI_TEXT_SCALE = 1.06;

const SCALE_VALUES: Record<FontScale, number> = {
  small:  0.87,
  normal: 1.00,
  large:  1.16,
};

interface AccessibilityContextValue {
  fontScalePref: FontScale;
  fontScaleValue: number;
  /** Returns a font size scaled by the user preference. */
  fontSize: (base: number) => number;
  setFontScale: (scale: FontScale) => Promise<void>;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fontScalePref, setFontScalePref] = useState<FontScale>('normal');

  // Load persisted preference on mount
  useEffect(() => {
    getFontScalePreference().then(setFontScalePref).catch(() => {});
  }, []);

  const setFontScale = useCallback(async (scale: FontScale) => {
    setFontScalePref(scale);
    await setFontScalePreference(scale);
  }, []);

  const fontScaleValue = SCALE_VALUES[fontScalePref];

  const fontSize = useCallback(
    (base: number) => Math.round(base * fontScaleValue * GLOBAL_UI_TEXT_SCALE),
    [fontScaleValue],
  );

  const value = useMemo<AccessibilityContextValue>(
    () => ({ fontScalePref, fontScaleValue, fontSize, setFontScale }),
    [fontScalePref, fontScaleValue, fontSize, setFontScale],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = (): AccessibilityContextValue => {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used inside <AccessibilityProvider>');
  return ctx;
};
