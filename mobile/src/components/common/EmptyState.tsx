import React from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, TouchableOpacity, StyleSheet } from 'react-native';

import { Spacing, BorderRadius, Shadows } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

interface EmptyStateProps {
  icon?: AppIconName;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'sparkles',
  title,
  subtitle,
  action,
}) => {
  const { colors: C } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.haloOuter, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}>
        <View style={[styles.haloInner, { backgroundColor: C.primary }]}>
          <AppIcon name={icon} size={36} color="#FFFFFF" />
        </View>
      </View>
      <Text style={[styles.title, { color: C.textPrimary }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: C.textSecondary }]}>{subtitle}</Text> : null}
      {action ? (
        <TouchableOpacity onPress={action.onPress} activeOpacity={0.85}>
          <View style={[styles.btn, { backgroundColor: C.primary }, Shadows.brand]}>
            <Text style={styles.btnText}>{action.label}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  haloOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    ...Shadows.sm,
  },
  haloInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  btn: {
    marginTop: Spacing.xl,
    paddingVertical: 13,
    paddingHorizontal: Spacing.xl + 4,
    borderRadius: BorderRadius.full,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

export default EmptyState;
