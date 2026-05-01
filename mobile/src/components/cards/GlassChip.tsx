import React, { memo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/ui/Text';
import { useTheme } from '@/context/ThemeContext';

export type GlassChipProps = {
  text: React.ReactNode;
  subText?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
};

export const GlassChip = memo(function GlassChip({ text, subText, onPress, style, testID }: GlassChipProps) {
  const { colors: C } = useTheme();

  const content = (
    <>
      <Text style={[styles.text, { color: C.textPrimary }]}>{text}</Text>
      {!!subText && <Text style={[styles.sub, { color: C.textMuted }]}>{subText}</Text>}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        style={[
          styles.wrap,
          { backgroundColor: C.primarySurface, borderColor: C.primarySoft },
          style,
        ]}
        onPress={onPress}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      style={[
        styles.wrap,
        { backgroundColor: C.surfaceVariant, borderColor: C.border },
        style,
      ]}
    >
      {content}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sub: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '700',
  },
});
