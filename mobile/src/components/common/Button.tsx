import React from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { TouchableOpacity, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '../../theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gradient' | 'accent' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: AppIconName;
  style?: ViewStyle;
}

const Button: React.FC<ButtonProps> = ({
  title, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, fullWidth = false, icon, style,
}) => {
  const sizeStyle = SIZES[size];
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;

  const isFilled = variant === 'primary' || variant === 'secondary' || variant === 'danger'
                || variant === 'gradient' || variant === 'accent' || variant === 'success';
  const contentColor = isFilled
    ? '#FFFFFF'
    : variant === 'outline' || variant === 'ghost'
      ? Colors.primary
      : '#FFFFFF';

  const renderInner = () => (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <>
          {icon && (
            <AppIcon
              name={icon}
              size={iconSize}
              color={contentColor}
              style={{ marginRight: 8 }}
            />
          )}
          <Text
            style={[
              styles.text,
              { color: contentColor, fontSize: sizeStyle.fontSize },
            ] as TextStyle[]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </>
      )}
    </View>
  );

  // Gradient variant — distinctive Gen-Z signature button
  if (variant === 'gradient' && !disabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.85}
        style={[
          styles.base,
          { paddingVertical: 0, paddingHorizontal: 0 },
          fullWidth && styles.fullWidth,
          (disabled || loading) && styles.disabled,
          Shadows.brand,
          style,
        ]}
      >
        <LinearGradient
          colors={Gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradientInner,
            { paddingVertical: sizeStyle.paddingVertical, paddingHorizontal: sizeStyle.paddingHorizontal },
          ]}
        >
          {renderInner()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyle =
    variant === 'gradient' ? VARIANTS.primary : VARIANTS[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      style={[
        styles.base,
        variantStyle,
        { paddingVertical: sizeStyle.paddingVertical, paddingHorizontal: sizeStyle.paddingHorizontal },
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {renderInner()}
    </TouchableOpacity>
  );
};

const SIZES = {
  sm: { paddingVertical: 10, paddingHorizontal: Spacing.md, fontSize: 13 },
  md: { paddingVertical: 14, paddingHorizontal: Spacing.lg, fontSize: 15 },
  lg: { paddingVertical: 18, paddingHorizontal: Spacing.xl, fontSize: 17 },
};

const VARIANTS: Record<Exclude<Variant, 'gradient'>, ViewStyle> = {
  primary: {
    backgroundColor: Colors.primary,
    ...Shadows.brand,
  },
  secondary: {
    backgroundColor: Colors.secondary,
    ...Shadows.sunset,
  },
  accent: {
    backgroundColor: Colors.accent,
    ...Shadows.accent,
  },
  success: {
    backgroundColor: Colors.success,
    ...Shadows.emerald,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: Colors.error,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientInner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.45 },
  text: {
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

export default Button;
