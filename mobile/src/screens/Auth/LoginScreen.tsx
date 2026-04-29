import React, { useState, useEffect, useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Input, LogoMark } from '../../components/common';
import { Colors, Gradients, Spacing, BorderRadius } from '../../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_RESET_INTENT_KEY } from '../../constants/security';
import { openWhatsAppSupport } from '../../constants/support';
import {
  isBiometricAvailable, isBiometricEnabled, biometricLabel,
  authenticateWithBiometrics, getBiometricCredentials, saveBiometricCredentials,
} from '../../utils/biometricAuth';

type Nav = StackNavigationProp<AuthStackParamList, 'Login'>;

// ── Decorative background blobs ───────────────────────────────────────────────
const GeoBg = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {/* Large soft circle — top-right */}
    <View style={geo.c1} />
    {/* Medium circle — bottom-left */}
    <View style={geo.c2} />
    {/* Small bright dot — top-left */}
    <View style={geo.c3} />
    {/* Gold accent pill — bottom-right */}
    <View style={geo.c4} />
    {/* Gold accent dot */}
    <View style={geo.c5} />
  </View>
);

const geo = StyleSheet.create({
  c1: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -80,
  },
  c2: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -20, left: -60,
  },
  c3: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.10)', top: 36, left: 28,
  },
  c4: {
    position: 'absolute', width: 92, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(253,230,138,0.55)', bottom: 42, right: 28,
    transform: [{ rotate: '-12deg' }],
  },
  c5: {
    position: 'absolute', width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(253,230,138,0.75)', bottom: 30, right: 128,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
const LoginScreen = () => {
  const navigation = useNavigation<Nav>();
  const { login } = useAuth();
  const { lang } = useLanguage();
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
      style={{ flex: 1, backgroundColor: Colors.primaryDeep }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Hero gradient panel ────────────────────────────────────── */}
      <LinearGradient
        colors={Gradients.brand}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.topPanel}
      >
        <GeoBg />
        <SafeAreaView edges={['top']} style={styles.topInner}>

          {/* Step badge */}
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>
              {lang === 'fr' ? '01 — CONNEXION' : '٠١ — تسجيل الدخول'}
            </Text>
          </View>

          {/* Logo + App name */}
          <View style={styles.logoRow}>
            <LogoMark size="lg" showName={false} />
            <View style={{ flex: 1 }}>
              <Text style={styles.appName}>Studara</Text>
              <Text style={styles.tagline}>رفيقك في المسيرة الجامعية</Text>
            </View>
          </View>

          {/* Decorative stat pills */}
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <AppIcon name="libraryOutline"  size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.pillText}>{lang === 'fr' ? 'Ressources' : 'موارد'}</Text>
            </View>
            <View style={styles.pill}>
              <AppIcon name="calendarOutline" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.pillText}>{lang === 'fr' ? 'Emploi du temps' : 'جدول'}</Text>
            </View>
            <View style={styles.pill}>
              <AppIcon name="albumsOutline"   size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.pillText}>{lang === 'fr' ? 'Fiches' : 'بطاقات'}</Text>
            </View>
          </View>

        </SafeAreaView>
      </LinearGradient>

      {/* ── White form sheet ───────────────────────────────────────── */}
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          removeClippedSubviews={false}
        >
          <Text style={styles.formTitle}>
            {lang === 'fr' ? 'Bon retour 👋' : 'أهلاً بعودتك 👋'}
          </Text>
          <Text style={styles.formSub}>
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
            <Text style={styles.forgotText}>
              {lang === 'fr' ? 'Mot de passe oublié ?' : 'نسيت كلمة المرور؟'}
            </Text>
          </TouchableOpacity>

          {/* Login button — gradient pill */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.88}
            style={{
              borderRadius: BorderRadius.pill,
              overflow: 'hidden',
              opacity: loading ? 0.65 : 1,
              shadowColor: Colors.primary,
              shadowOpacity: 0.45,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: 10,
            }}
          >
            <LinearGradient
              colors={Gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.loginBtn}
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
                      color={Colors.primary}
                    />
                  </View>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Biometric quick login */}
          {bio.available && bio.enabled && (
            <TouchableOpacity
              style={styles.bioBtn}
              onPress={handleBiometricLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <AppIcon name="fingerPrint" size={22} color={Colors.primary} />
              <Text style={styles.bioBtnText}>
                {lang === 'fr' ? `Connexion avec ${bio.label}` : `دخول بـ${bio.label}`}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.regRow}>
            <Text style={styles.regText}>
              {lang === 'fr' ? 'Pas encore de compte ? ' : 'ليس لديك حساب؟ '}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
              <Text style={styles.regLink}>
                {lang === 'fr' ? 'Créer un compte' : 'إنشاء حساب'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Hero gradient panel
  topPanel: { flex: 0.46, overflow: 'hidden' },
  topInner: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 36,
    justifyContent: 'flex-end',
    gap: 16,
  },

  // Step badge
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.pill,
  },
  badgeDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FDE68A' },
  badgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '800', letterSpacing: 1.4 },

  // Logo row
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  appName: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -1.8, lineHeight: 52 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: '500' },

  // Feature pill row
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.pill,
  },
  pillText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.2 },

  // White sheet
  sheet: {
    flex: 0.54,
    zIndex: 1,
    elevation: 8,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    marginTop: -32, paddingTop: 12,
    shadowColor: '#0F0A1F', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -8 },
  },
  handle: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 10,
  },
  form:      { paddingHorizontal: Spacing.xl, paddingBottom: 32 },
  formTitle: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -0.6, marginBottom: 6, marginTop: 4 },
  formSub:   { fontSize: 14, color: Colors.textSecondary, marginBottom: Spacing.xl, lineHeight: 20 },

  forgot:     { alignSelf: 'flex-end', marginBottom: Spacing.lg, marginTop: 2 },
  forgotText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  // Gradient login button
  loginBtn:      { paddingVertical: 17, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loginBtnText:  { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center', letterSpacing: 0.3 },
  loginBtnArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  // Biometric button
  bioBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 14, paddingVertical: 14,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1.5, borderColor: Colors.primarySoft,
    borderRadius: BorderRadius.pill,
  },
  bioBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '800' },

  regRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.xl, flexWrap: 'wrap' },
  regText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  regLink: { color: Colors.primary, fontSize: 13, fontWeight: '800' },
});

export default LoginScreen;
