import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/context/ThemeContext';
import { useAppFeatures } from '@/hooks/useAppFeatures';

type Props = {
  featureKey: string;
  defaultEnabled: boolean;
  children: React.ReactNode;
};

export function FeatureGate({ featureKey, defaultEnabled, children }: Props) {
  const nav = useNavigation<any>();
  const { colors: C } = useTheme();
  const { isEnabled, refetch } = useAppFeatures();

  // When the screen is shown, refresh once (helps when user toggled in admin panel).
  useEffect(() => {
    refetch();
  }, [refetch]);

  const enabled = isEnabled(featureKey, defaultEnabled);
  if (enabled) return <>{children}</>;

  return (
    <View style={[styles.wrap, { backgroundColor: C.background }]}>
      <Text style={[styles.title, { color: C.textPrimary }]}>Fonctionnalité désactivée</Text>
      <Text style={[styles.sub, { color: C.textMuted }]}>
        Ce module a été désactivé depuis l’admin. Réessaie plus tard.
      </Text>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: C.primary }]}
        onPress={() => (nav?.goBack ? nav.goBack() : nav.navigate('Home'))}
        activeOpacity={0.85}
      >
        <Text style={styles.btnText}>Retour</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 8 },
  sub: { fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 18, marginBottom: 16 },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  btnText: { color: '#fff', fontWeight: '900' },
});

