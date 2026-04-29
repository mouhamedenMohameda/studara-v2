import React, { useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { useLanguage } from '../../context/LanguageContext';
import { Input } from '../../components/common';
import { BorderRadius, Colors, Gradients, Spacing } from '../../theme';
import { apiRequest } from '../../utils/api';
import type { RootStackParamList } from '../../types';

type R = RouteProp<RootStackParamList, 'PasswordResetSetNew'>;
type N = StackNavigationProp<RootStackParamList, 'PasswordResetSetNew'>;

export default function PasswordResetSetNewPasswordScreen() {
  const navigation = useNavigation<N>();
  const route = useRoute<R>();
  const { intentId, ticket } = route.params;
  const { lang } = useLanguage();

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!newPassword || !confirm) {
      Alert.alert(lang === 'fr' ? 'Champs requis' : 'حقول مطلوبة', lang === 'fr' ? 'Remplissez tous les champs.' : 'يرجى ملء جميع الحقول.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert(lang === 'fr' ? 'Trop court' : 'قصيرة جداً', lang === 'fr' ? 'Au moins 8 caractères.' : 'يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    if (newPassword !== confirm) {
      Alert.alert(lang === 'fr' ? 'Mot de passe' : 'كلمة المرور', lang === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'كلمتا المرور غير متطابقتين.');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/auth/password-reset/confirm', {
        method: 'POST',
        body: { intentId, ticket, newPassword },
      });
      Alert.alert(
        lang === 'fr' ? 'Terminé' : 'تم',
        lang === 'fr' ? 'Mot de passe mis à jour. Reconnectez-vous.' : 'تم تحديث كلمة المرور. سجّل الدخول من جديد.',
        [{ text: lang === 'fr' ? 'OK' : 'حسناً', onPress: () => navigation.popToTop() }],
      );
    } catch (e: any) {
      Alert.alert(lang === 'fr' ? 'Erreur' : 'خطأ', e.message);
    } finally {
      setLoading(false);
    }
  };

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
            <AppIcon name="keyOutline" size={34} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{lang === 'fr' ? 'Nouveau mot de passe' : 'كلمة مرور جديدة'}</Text>
          <Text style={styles.sub}>
            {lang === 'fr'
              ? 'Choisissez un mot de passe fort (8+ caractères).'
              : 'اختر كلمة مرور قوية (8 أحرف أو أكثر).'}
          </Text>

          <Input
            labelAr={lang === 'fr' ? 'Nouveau mot de passe' : 'كلمة المرور الجديدة'}
            placeholder="••••••••"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            icon="lockClosedOutline"
          />
          <Input
            labelAr={lang === 'fr' ? 'Confirmer le mot de passe' : 'تأكيد كلمة المرور'}
            placeholder="••••••••"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            icon="shieldCheckmarkOutline"
          />

          <TouchableOpacity
            onPress={submit}
            disabled={loading}
            activeOpacity={0.86}
            style={[styles.primaryBtn, { opacity: loading ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>
              {lang === 'fr' ? 'Confirmer' : 'تأكيد'}
            </Text>
          </TouchableOpacity>

          <View style={styles.meta}>
            <Text style={styles.metaText}>
              {lang === 'fr' ? 'Intent' : 'المعرّف'}: <Text style={styles.metaMono}>{intentId}</Text>
            </Text>
          </View>
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
  primaryBtn: {
    height: 54,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  meta: { marginTop: Spacing.lg, alignItems: 'center' },
  metaText: { color: Colors.textMuted, fontWeight: '800', fontSize: 11 },
  metaMono: { color: Colors.textSecondary, fontWeight: '800' },
});

