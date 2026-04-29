import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../../theme';

type Variant = 'elevated' | 'outlined' | 'filled' | 'glass' | 'tinted';
type PaddingSize = 'sm' | 'md' | 'lg' | 'xl' | 'none';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  variant?: Variant;
  padding?: PaddingSize;
}

const Card: React.FC<CardProps> = ({ children, style, variant = 'elevated', padding = 'md' }) => (
  <View style={[styles.base, styles[variant], styles[`pad_${padding}`], style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  base: { borderRadius: BorderRadius.card, overflow: 'hidden' },
  elevated: {
    backgroundColor: Colors.surface,
    ...Shadows.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  outlined: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  filled: {
    backgroundColor: Colors.surfaceVariant,
  },
  tinted: {
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primarySoft,
  },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  pad_none: {},
  pad_sm: { padding: Spacing.sm },
  pad_md: { padding: Spacing.base },
  pad_lg: { padding: Spacing.lg },
  pad_xl: { padding: Spacing.xl },
});

export default Card;
