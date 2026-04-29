import React from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet } from 'react-native';

interface Props {
  /** Override the default Arabic message */
  message?: string;
}

/**
 * Thin banner displayed at the top of a screen when the app is offline
 * and showing locally-cached data.
 */
export const OfflineBanner = ({ message }: Props) => (
  <View style={styles.banner}>
    <View style={styles.dot}>
      <AppIcon name="cloudOffline" size={11} color="#FFFFFF" />
    </View>
    <Text style={styles.text}>
      {message ?? 'أنت غير متصل — يتم عرض البيانات المحفوظة'}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1A1535',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 18,
    gap: 8,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FEF3C7',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
    letterSpacing: 0.2,
  },
});
