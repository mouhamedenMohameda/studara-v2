import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { useTheme } from '@/context/ThemeContext';
import { BorderRadius, Layout, Shadows } from '@/theme';

export type TopBarProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon?: 'arrowBack' | 'arrowForward';
  right?: React.ReactNode;
};

/**
 * Consistent sticky header row (pilule retour + titres hiérarchisés).
 */
export function TopBar({
  title,
  subtitle,
  onBack,
  backIcon,
  right,
}: TopBarProps) {
  const { colors: C } = useTheme();

  const iconName = backIcon ?? 'arrowBack';

  return (
    <View style={styles.row}>
      <View style={[styles.slot, styles.left]}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            activeOpacity={0.76}
            style={[
              styles.iconPill,
              { backgroundColor: C.surfaceVariant, borderColor: C.borderLight },
            ]}
          >
            <AppIcon name={iconName} size={20} color={C.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: Layout.minTapTarget }} />
        )}
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: C.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: C.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={[styles.slot, styles.right]}>{right}</View>
    </View>
  );
}

/** Small circular-ish action beside the TopBar title row (filtres, partage…) */
export function TopBarCircleButton(props: {
  onPress?: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  const { colors: C } = useTheme();

  const inner = (
    <View
      style={[
        styles.circleBtnInner,
        { backgroundColor: C.surfaceVariant, borderColor: C.borderLight },
      ]}
    >
      {props.children}
    </View>
  );

  if (!props.onPress) return inner;

  return (
    <TouchableOpacity
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      activeOpacity={0.76}
    >
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingX - 6,
    paddingBottom: Layout.sectionGapY * 0.45,
    minHeight: 52,
    gap: 6,
  },
  slot: { minWidth: Layout.minTapTarget, justifyContent: 'center' },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end', flexGrow: 0 },
  iconPill: {
    width: Layout.minTapTarget - 4,
    height: Layout.minTapTarget - 4,
    borderRadius: BorderRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.xs,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  circleBtnInner: {
    width: Layout.minTapTarget - 6,
    height: Layout.minTapTarget - 6,
    borderRadius: BorderRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.xs,
  },
});
