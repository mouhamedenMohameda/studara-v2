import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { BorderRadius, Colors, Gradients, Spacing } from '../../theme';
import { apiRequest } from '../../utils/api';
import type { RootStackParamList } from '../../types';

type R = RouteProp<RootStackParamList, 'PasswordResetApproval'>;
type N = StackNavigationProp<RootStackParamList, 'PasswordResetApproval'>;

type IntentDto = {
  id: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'COMPLETED';
  requestedAt?: string;
  requestedIp?: string | null;
  requestedUserAgent?: string | null;
  requestedDeviceLabel?: string | null;
};

export default function PasswordResetApprovalScreen() {
  const navigation = useNavigation<N>();
  const route = useRoute<R>();
  const { intentId } = route.params;
  const { token } = useAuth();
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<IntentDto | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest<IntentDto>(`/auth/password-reset/intents/${intentId}`, { token });
      setIntent(data);
    } catch (e: any) {
      // If API doesn't exist yet, still allow the screen to render.
      setIntent(null);
    }
  }, [intentId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async () => {
    if (!token) {
      Alert.alert(lang === 'fr' ? 'Connexion requise' : 'تسجيل الدخول مطلوب', lang === 'fr' ? "Connectez-vous d'abord." : 'سجّل الدخول أولاً.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ ticket: string; expiresAt?: string }>(
        `/auth/password-reset/intents/${intentId}/approve`,
        { method: 'POST', token },
      );
      navigation.replace('PasswordResetSetNew', { intentId, ticket: res.ticket });
    } catch (e: any) {
      Alert.alert(lang === 'fr' ? 'Erreur' : 'خطأ', e.message);
    } finally {
      setLoading(false);
    }
  };

  const deny = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest(`/auth/password-reset/intents/${intentId}/deny`, { method: 'POST', token });
      Alert.alert(
        lang === 'fr' ? 'Refusé' : 'تم الرفض',
        lang === 'fr' ? 'La demande a été refusée.' : 'تم رفض الطلب.',
        [{ text: lang === 'fr' ? 'OK' : 'حسناً', onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      Alert.alert(lang === 'fr' ? 'Erreur' : 'خطأ', e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusLabel =
    intent?.status === 'PENDING_APPROVAL' ? (lang === 'fr' ? 'En attente' : 'قيد الانتظار')
    : intent?.status === 'APPROVED'        ? (lang === 'fr' ? 'Approuvé' : 'تمت الموافقة')
    : intent?.status === 'DENIED'          ? (lang === 'fr' ? 'Refusé' : 'مرفوض')
    : intent?.status === 'EXPIRED'         ? (lang === 'fr' ? 'Expiré' : 'منتهي')
    : intent?.status === 'COMPLETED'       ? (lang === 'fr' ? 'Terminé' : 'مكتمل')
    : (lang === 'fr' ? '—' : '—');

  return (
    <LinearGradient colors={Gradients.brand as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
            <AppIcon name={lang === 'ar' ? 'arrowForward' : 'arrowBack'} size={22} color="#fff" />
            <Text style={styles.backText}>{lang === 'fr' ? 'Retour' : 'رجوع'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <AppIcon name="shieldCheckmarkOutline" size={34} color={Colors.primary} />
          </View>
          <Text style={styles.title}>
            {lang === 'fr' ? 'Confirmer le changement de mot de passe' : 'تأكيد تغيير كلمة المرور'}
          </Text>

          <Text style={styles.sub}>
            {lang === 'fr'
              ? "Quelqu'un a demandé à réinitialiser le mot de passe. Autorisez uniquement si c'est vous."
              : 'تم طلب إعادة تعيين كلمة المرور. وافق فقط إذا كنت أنت.'}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{lang === 'fr' ? 'Statut' : 'الحالة'}</Text>
            <Text style={styles.metaValue}>{statusLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{lang === 'fr' ? 'ID' : 'المعرّف'}</Text>
            <Text style={styles.metaValueMono}>{intentId}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={approve}
              disabled={loading}
              activeOpacity={0.86}
              style={[styles.primaryBtn, { opacity: loading ? 0.6 : 1 }]}
            >
              <Text style={styles.primaryBtnText}>{lang === 'fr' ? 'Autoriser' : 'موافقة'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={deny}
              disabled={loading}
              activeOpacity={0.86}
              style={[styles.dangerBtn, { opacity: loading ? 0.6 : 1 }]}
            >
              <Text style={styles.dangerBtnText}>{lang === 'fr' ? 'Refuser' : 'رفض'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={load} disabled={loading} style={styles.refreshRow} activeOpacity={0.8}>
            <Text style={styles.refreshText}>{lang === 'fr' ? 'Actualiser' : 'تحديث'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  backText: { color: '#fff', fontWeight: '800' },
  card: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.xl,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: Spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    alignSelf: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: Spacing.lg },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  metaLabel: { color: Colors.textMuted, fontWeight: '700', fontSize: 12 },
  metaValue: { color: Colors.textPrimary, fontWeight: '800', fontSize: 12 },
  metaValueMono: { color: Colors.textSecondary, fontWeight: '700', fontSize: 11, maxWidth: 200 },
  actions: { marginTop: Spacing.md, gap: 10 },
  primaryBtn: {
    height: 54,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  dangerBtn: {
    height: 54,
    borderRadius: BorderRadius.pill,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dangerBtnText: { color: '#B91C1C', fontWeight: '900', fontSize: 15 },
  refreshRow: { marginTop: Spacing.lg, alignItems: 'center' },
  refreshText: { color: Colors.textMuted, fontWeight: '800' },
});

