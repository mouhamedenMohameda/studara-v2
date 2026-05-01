import React, { useState, useEffect, useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Input, LogoMark } from '../../components/common';
import { Colors, Spacing, BorderRadius, Shadows } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_RESET_INTENT_KEY } from '../../constants/security';
import { openWhatsAppSupport } from '../../constants/support';
import {
  isBiometricAvailable, isBiometricEnabled, biometricLabel,
  authenticateWithBiometrics, getBiometricCredentials, saveBiometricCredentials,
} from '../../utils/biometricAuth';

type Nav = StackNavigationProp<AuthStackParamList, 'Login'>;

// ─────────────────────────────────────────────────────────────────────────────
const LoginScreen = () => {
  const navigation = useNavigation<Nav>();
  const { login } = useAuth();
  const { lang } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  // ── Biometric (single update + after interactions: avoids layout churn on first TextInput focus)
  const [bio, setBio] = useState<{ available: boolean; enabled: boolean; label: string }>({
    available: false,
    enabled: false,
    label: 'البصمة',
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const available = await isBiometricAvailable();
        const enabled = await isBiometricEnabled();
        const label = await biometricLabel(lang as 'ar' | 'fr' | 'en');
        if (cancelled) return;
        // Yield one frame so this re-render doesn’t land in the same tick as the first TextInput focus.
        requestAnimationFrame(() => {
          if (!cancelled) setBio({ available, enabled, label });
        });
      } catch {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (!cancelled) {
            setBio({
              available: false,
              enabled: false,
              label: lang === 'fr' ? 'Empreinte' : 'البصمة',
            });
          }
        });
      }
    })();
    return () => { cancelled = true; };
  }, [lang]);

  useEffect(() => {
    // If a password-reset intent was tapped while logged out, show guidance once.
    void (async () => {
      const intentId = await AsyncStorage.getItem(PENDING_RESET_INTENT_KEY);
      if (!intentId) return;
      Alert.alert(
        lang === 'fr' ? 'Action requise' : 'يلزم إجراء',
        lang === 'fr'
          ? "Pour approuver, ouvrez Studara sur un appareil où vous êtes déjà connecté. Si vous n'avez plus accès, contactez le support."
          : 'للموافقة، افتح Studara على جهاز مسجّل الدخول. إذا لم يعد لديك وصول، تواصل مع الدعم.',
        [
          {
            text: lang === 'fr' ? 'WhatsApp' : 'واتساب',
            onPress: () => openWhatsAppSupport('Bonjour, je n’ai plus accès à mon compte Studara et je veux réinitialiser mon mot de passe.'),
          },
          {
            text: lang === 'fr' ? 'OK' : 'حسناً',
            style: 'cancel',
          },
        ],
      );
      // Clear so we don't re-alert every time.
      await AsyncStorage.removeItem(PENDING_RESET_INTENT_KEY);
    })().catch(() => {});
  }, [lang]);

  const handleBiometricLogin = useCallback(async () => {
    const creds = await getBiometricCredentials();
    if (!creds) { Alert.alert(lang === 'fr' ? 'Non configuré' : 'غير مُفعَّل', lang === 'fr' ? 'Connectez-vous d\'abord manuellement.' : 'سجّل الدخول يدوياً أولاً لتفعيل البصمة.'); return; }
    const ok = await authenticateWithBiometrics(lang === 'fr' ? `Connexion à Studara` : 'تسجيل الدخول إلى ستودارا');
    if (!ok) return;
    try {
      setLoading(true);
      await login(creds.email, creds.password);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (lang === 'fr' ? 'Réessayez' : 'حاول مرة أخرى');
      if (msg === 'Account pending approval') {
        Alert.alert(
          lang === 'fr' ? '⏳ Compte en attente' : '⏳ الحساب قيد المراجعة',
          lang === 'fr'
            ? 'Votre compte n\'a pas encore été approuvé. Contactez-nous sur WhatsApp pour l\'activer.'
            : 'لم يتم تفعيل حسابك بعد. تواصل معنا على واتساب لتسريع المراجعة.',
          [{ text: lang === 'fr' ? 'OK' : 'حسناً' }],
        );
        return;
      }
      Alert.alert(lang === 'fr' ? 'Erreur' : 'خطأ', msg);
    } finally { setLoading(false); }
  }, [lang, login]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      await login(email, password);
      // After successful manual login, offer to enable biometrics
      if (bio.available && !bio.enabled && email && password) {
        Alert.alert(
          lang === 'fr' ? `Activer ${bio.label} ?` : `تفعيل ${bio.label}?`,
          lang === 'fr'
            ? `Connectez-vous plus rapidement la prochaine fois avec ${bio.label}.`
            : `تسجّل دخولك بسرعة بدون كلمة مرور في المرات القادمة.`,
          [
            { text: lang === 'fr' ? 'Pas maintenant' : 'ليس الآن', style: 'cancel' },
            { text: lang === 'fr' ? 'Activer' : 'تفعيل', onPress: () => saveBiometricCredentials(email, password).catch(() => {}) },
          ]
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (lang === 'fr' ? 'Réessayez' : 'حاول مرة أخرى');
      if (msg === 'Account pending approval') {
        Alert.alert(
          lang === 'fr' ? '⏳ Compte en attente' : '⏳ الحساب قيد المراجعة',
          lang === 'fr'
            ? 'Votre compte n\'a pas encore été approuvé. Contactez-nous sur WhatsApp pour l\'activer.'
            : 'لم يتم تفعيل حسابك بعد. تواصل معنا على واتساب لتسريع المراجعة.',
          [{ text: lang === 'fr' ? 'OK' : 'حسناً' }],
        );
        return;
      }
      Alert.alert(lang === 'fr' ? 'Erreur de connexion' : 'خطأ في تسجيل الدخول', msg);
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 36 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        removeClippedSubviews={false}
      >
        <SafeAreaView edges={['top']} style={{ paddingHorizontal: Spacing.xl }}>
          <View style={[styles.heroCard, { backgroundColor: C.surface, borderColor: C.borderLight }, Shadows.sm]}>
            <View style={[styles.heroAccent, { backgroundColor: C.primary }]} />
            <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: C.primarySoft, top: -80, right: -60 }} pointerEvents="none" />
            <View style={[styles.badge, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}>
              <View style={[styles.badgeDot, { backgroundColor: C.secondaryDark }]} />
              <Text style={[styles.badgeText, { color: C.primary }]}>
                {lang === 'fr' ? 'CONNEXION' : 'تسجيل الدخول'}
              </Text>
            </View>
            <View style={styles.logoRow}>
              <LogoMark size="lg" variant="brand" showName={false} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.appName, { color: C.textPrimary }]}>Studara</Text>
                <Text style={[styles.tagline, { color: C.textSecondary }]}>{lang === 'fr' ? 'Ton compagnon étudiant' : 'رفيقك في المسيرة الجامعية'}</Text>
              </View>
            </View>
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
                <AppIcon name="libraryOutline" size={13} color={C.primary} />
                <Text style={[styles.pillText, { color: C.textSecondary }]}>{lang === 'fr' ? 'Ressources' : 'موارد'}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
                <AppIcon name="calendarOutline" size={13} color={C.primary} />
                <Text style={[styles.pillText, { color: C.textSecondary }]}>{lang === 'fr' ? 'Planning' : 'جدول'}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
                <AppIcon name="albumsOutline" size={13} color={C.primary} />
                <Text style={[styles.pillText, { color: C.textSecondary }]}>{lang === 'fr' ? 'Fiches' : 'بطاقات'}</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>

        <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.lg }}>
          <Text style={[styles.formTitle, { color: C.textPrimary }]}>
            {lang === 'fr' ? 'Bon retour 👋' : 'أهلاً بعودتك 👋'}
          </Text>
          <Text style={[styles.formSub, { color: C.textSecondary }]}>
            {lang === 'fr'
              ? 'Connectez-vous pour accéder à vos ressources.'
              : 'سجّل دخولك للوصول إلى مواردك الأكاديمية.'}
          </Text>

          <Input
            labelAr={lang === 'fr' ? 'Adresse e-mail' : 'البريد الإلكتروني'}
            placeholder="example@una.mr"
            value={email}
            onChangeText={setEmail}
            icon='mailOutline'
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            rtl={false}
          />
          <Input
            labelAr={lang === 'fr' ? 'Mot de passe' : 'كلمة المرور'}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            icon='lockClosedOutline'
            autoComplete="password"
          />

          <TouchableOpacity style={styles.forgot} activeOpacity={0.7} onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={[styles.forgotText, { color: C.primary }]}>
              {lang === 'fr' ? 'Mot de passe oublié ?' : 'نسيت كلمة المرور؟'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.88}
            style={[
              styles.loginBtnOuter,
              { backgroundColor: C.primary, opacity: loading ? 0.65 : 1 },
              Shadows.brand,
            ]}
          >
            {loading ? (
              <AppIcon name="reloadOutline" size={20} color="#fff" />
            ) : (
              <>
                <Text style={styles.loginBtnText}>
                  {lang === 'fr' ? 'Se connecter' : 'تسجيل الدخول'}
                </Text>
                <View style={styles.loginBtnArrow}>
                  <AppIcon
                    name={lang === 'ar' ? 'arrowBack' : 'arrowForward'}
                    size={16}
                    color={C.primary}
                  />
                </View>
              </>
            )}
          </TouchableOpacity>

          {/* Biometric quick login */}
          {bio.available && bio.enabled && (
            <TouchableOpacity
              style={[styles.bioBtn, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}
              onPress={handleBiometricLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <AppIcon name="fingerPrint" size={22} color={C.primary} />
              <Text style={[styles.bioBtnText, { color: C.primary }]}>
                {lang === 'fr' ? `Connexion avec ${bio.label}` : `دخول بـ${bio.label}`}
              </Text>
            </TouchableOpacity>
          )}

          <View style={[styles.regRow, { paddingBottom: 8 }]}>
            <Text style={[styles.regText, { color: C.textSecondary }]}>
              {lang === 'fr' ? 'Pas encore de compte ? ' : 'ليس لديك حساب؟ '}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
              <Text style={[styles.regLink, { color: C.primary }]}>
                {lang === 'fr' ? 'Créer un compte' : 'إنشاء حساب'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  heroCard: {
    marginTop: 8,
    borderRadius: BorderRadius['3xl'],
    borderWidth: 1,
    padding: Spacing.lg,
    paddingLeft: Spacing.lg + 8,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 220,
    justifyContent: 'flex-end',
    gap: 14,
  },
  heroAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    borderTopLeftRadius: BorderRadius['3xl'],
    borderBottomLeftRadius: BorderRadius['3xl'],
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: BorderRadius.pill,
  },
  badgeDot:  { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  appName: { fontSize: 40, fontWeight: '900', letterSpacing: -1.6, lineHeight: 44 },
  tagline: { fontSize: 14, marginTop: 6, fontWeight: '600' },

  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: BorderRadius.pill,
  },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  formTitle: { fontSize: 26, fontWeight: '900', letterSpacing: -0.65, marginBottom: 8, marginTop: 4 },
  formSub:   { fontSize: 14, marginBottom: Spacing.lg, lineHeight: 20 },

  forgot:     { alignSelf: 'flex-end', marginBottom: Spacing.lg, marginTop: 2 },
  forgotText: { fontSize: 13, fontWeight: '700' },

  loginBtnOuter: {
    borderRadius: BorderRadius.pill,
    paddingVertical: 17,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  loginBtnText:  { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center', letterSpacing: 0.3 },
  loginBtnArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  // Biometric button
  bioBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 14, paddingVertical: 14,
    borderWidth: 1.5,
    borderRadius: BorderRadius.pill,
  },
  bioBtnText: { fontSize: 14, fontWeight: '800' },

  regRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.xl, flexWrap: 'wrap' },
  regText: { fontSize: 13, fontWeight: '500' },
  regLink: { fontSize: 13, fontWeight: '800' },
});

export default LoginScreen;
