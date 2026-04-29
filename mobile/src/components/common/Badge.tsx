import React from 'react';
import { Text } from '@/ui/Text';
import { View, StyleSheet } from 'react-native';
import { Colors, BorderRadius } from '../../theme';

type Variant = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'gold';
type Size = 'sm' | 'md';

interface BadgeProps { label: string; variant?: Variant; size?: Size; dot?: boolean }

const variantColors: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary:  { bg: Colors.primarySurface, text: Colors.primary,   border: Colors.primarySoft },
  secondary:{ bg: Colors.secondarySurface, text: Colors.secondary, border: Colors.secondarySurface },
  accent:   { bg: Colors.accentSurface,  text: Colors.accent,    border: Colors.accentSurface },
  success:  { bg: '#D1FAE5',             text: '#047857',        border: '#A7F3D0' },
  warning:  { bg: '#FEF3C7',             text: '#B45309',        border: '#FDE68A' },
  error:    { bg: '#FEE2E2',             text: '#BE123C',        border: '#FECACA' },
  info:     { bg: '#DBEAFE',             text: '#1D4ED8',        border: '#BFDBFE' },
  neutral:  { bg: Colors.surfaceVariant, text: Colors.textSecondary, border: Colors.border },
  gold:     { bg: '#FEF3C7',             text: '#B45309',        border: '#F59E0B' },
};

const Badge: React.FC<BadgeProps> = ({ label, variant = 'primary', size = 'md', dot = false }) => {
  const { bg, text, border } = variantColors[variant];
  return (
    <View style={[
      styles.base,
      { backgroundColor: bg, borderColor: border ?? bg },
      styles[size],
    ]}>
      {dot && <View style={[styles.dot, { backgroundColor: text }]} />}
      <Text style={[
        styles.label,
        { color: text },
        size === 'sm' && styles.labelSm,
      ]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  sm: { paddingVertical: 3, paddingHorizontal: 9 },
  md: { paddingVertical: 5, paddingHorizontal: 11 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  labelSm: { fontSize: 11 },
});

export default Badge;
