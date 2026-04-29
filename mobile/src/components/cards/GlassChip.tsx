import React, { memo } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Text } from '@/ui/Text';

export type GlassChipProps = {
  text: React.ReactNode;
  subText?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
};

export const GlassChip = memo(function GlassChip({ text, subText, onPress, style, testID }: GlassChipProps) {
  const Wrap: any = onPress ? Pressable : Pressable;
  return (
    <Wrap
      testID={testID}
      style={[styles.wrap, style]}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text style={styles.text}>{text}</Text>
      {!!subText && <Text style={[styles.text, styles.sub]}>{subText}</Text>}
    </Wrap>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  sub: {
    fontSize: 10,
    opacity: 0.7,
    marginTop: 2,
  },
});

