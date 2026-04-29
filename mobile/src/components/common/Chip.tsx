/**
 * Chip — Pill-shaped filter / tag chip with optional icon & active state.
 */
import React from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { TouchableOpacity, StyleSheet, View, ViewStyle } from 'react-native';

import { Colors } from '../../theme';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: AppIconName;
  color?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

const Chip: React.FC<ChipProps> = ({
  label,
  active = false,
  onPress,
  icon,
  color,
  size = 'md',
  style,
}) => {
  const tint = color ?? Colors.primary;
  const Comp: any = onPress ? TouchableOpacity : View;
  const sizeStyle = size === 'sm' ? { paddingVertical: 5, paddingHorizontal: 10 } : { paddingVertical: 7, paddingHorizontal: 13 };
  return (
    <Comp
      onPress={onPress}
      activeOpacity={0.82}
      style={[
        styles.base,
        sizeStyle,
        active
          ? { backgroundColor: tint, borderColor: tint }
          : { backgroundColor: Colors.surface, borderColor: Colors.border },
        style,
      ]}
    >
      {icon && (
        <AppIcon
          name={icon}
          size={size === 'sm' ? 12 : 14}
          color={active ? '#FFFFFF' : tint}
          style={{ marginRight: 5 }}
        />
      )}
      <Text
        style={[
          styles.label,
          size === 'sm' && styles.labelSm,
          { color: active ? '#FFFFFF' : Colors.textPrimary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Comp>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  labelSm: {
    fontSize: 12,
  },
});

export default Chip;
