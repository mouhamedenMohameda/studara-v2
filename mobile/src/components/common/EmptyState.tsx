import React from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, TouchableOpacity, StyleSheet } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Gradients, Shadows } from '../../theme';

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
}) => (
  <View style={styles.container}>
    <View style={styles.haloOuter}>
      <LinearGradient
        colors={Gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.haloInner}
      >
        <AppIcon name={icon} size={40} color="#FFFFFF" />
      </LinearGradient>
    </View>
    <Text style={styles.title}>{title}</Text>
    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    {action && (
      <TouchableOpacity onPress={action.onPress} activeOpacity={0.85} style={styles.btnWrap}>
        <LinearGradient
          colors={Gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          <Text style={styles.btnText}>{action.label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  haloOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySurface,
    marginBottom: Spacing.lg,
    ...Shadows.brand,
  },
  haloInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  btnWrap: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    ...Shadows.brand,
  },
  btn: {
    paddingVertical: 13,
    paddingHorizontal: Spacing.xl + 4,
    borderRadius: BorderRadius.full,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});

export default EmptyState;
