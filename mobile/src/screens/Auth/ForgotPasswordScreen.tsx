import React, { useState } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { Input } from '../../components/common';
import { Colors, Spacing, BorderRadius, Shadows } from '../../theme';
import { apiRequest } from '../../utils/api';
import { safeBack } from '../../utils/safeBack';
import { openWhatsAppSupport } from '../../constants/support';

type Nav = StackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

const ForgotPasswordScreen = () => {
  const navigation = useNavigation<Nav>();
  const { lang } = useLanguage();
  const { colors: C, isDark } = useTheme();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    const emailTrim = email.trim().toLowerCase();
    if (!emailTrim) {
      Alert.alert(
        lang === 'fr' ? 'Champs requis' : 'حقول مطلوبة',
        lang === 'fr' ? 'Entrez votre e-mail.' : 'أدخل بريدك الإلكتروني.',
      ); return;
    }
    try {
      setLoading(true);
      await apiRequest('/auth/password-reset/request', {
        method: 'POST',
        body: { email: emailTrim },
      });
      setDone(true);
    } catch (e: any) {
      Alert.alert(lang === 'fr' ? 'Erreur' : 'خطأ', e.message);
    } finally { setLoading(false); }
  };

  if (done) {
    return (
      <View style={[styles.fill, { backgroundColor: C.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
        <SafeAreaView style={[styles.fill, styles.doneCenter]} edges={['top', 'bottom']}>
          <View style={[styles.doneCard, { backgroundColor: C.surface, borderColor: C.borderLight }, Shadows.sm]}>
            <View style={[styles.doneIconOuter, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}>
              <AppIcon name="checkmarkCircle" size={52} color={C.primary} />
            </View>
            <Text style={[styles.doneTitle, { color: C.textPrimary }]}>
              {lang === 'fr' ? 'Demande envoyée ✅' : 'تم إرسال الطلب ✅'}
            </Text>
            <Text style={[styles.doneSub, { color: C.textSecondary }]}>
              {lang === 'fr'
                ? "Si un compte existe, une demande a été créée. Ouvrez Studara sur un appareil où vous êtes déjà connecté pour approuver la demande."
                : 'إذا كان الحساب موجودًا، تم إنشاء طلب. افتح Studara على جهاز مسجّل الدخول للموافقة على الطلب.'}
            </Text>
            <TouchableOpacity
              style={[styles.backBtnFilled, { backgroundColor: C.primary }, Shadows.brand]}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.88}
            >
              <Text style={styles.backBtnFilledText}>
                {lang === 'fr' ? 'Retour à la connexion' : 'العودة لتسجيل الدخول'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 48 }]}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={{ paddingHorizontal: Spacing.xl }}>
          <TouchableOpacity
            onPress={() => safeBack(navigation as any, { name: 'Login' })}
            style={[styles.topBack, { marginBottom: Spacing.md }]}
            hitSlop={12}
          >
            <AppIcon name={lang === 'ar' ? 'arrowForward' : 'arrowBack'} size={22} color={C.primary} />
            <Text style={[styles.backRowText, { color: C.primary }]}>
              {lang === 'fr' ? 'Retour' : 'رجوع'}
            </Text>
          </TouchableOpacity>

          <View style={[styles.heroCard, { backgroundColor: C.surface, borderColor: C.borderLight }, Shadows.sm]}>
            <View style={[styles.heroAccent, { backgroundColor: C.secondaryDark }]} />
            <View style={[styles.iconWrap, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
              <AppIcon name="keyOutline" size={36} color={C.secondaryDark} />
            </View>
            <Text style={[styles.heroTitle, { color: C.textPrimary }]}>
              {lang === 'fr' ? 'Mot de passe oublié ?' : 'نسيت كلمة المرور؟'}
            </Text>
            <Text style={[styles.heroSub, { color: C.textSecondary }]}>
              {lang === 'fr'
                ? "Entrez votre e-mail. Si vous êtes déjà connecté sur un autre appareil, vous pourrez approuver la demande directement dans l'app."
                : 'أدخل بريدك الإلكتروني. إذا كنت مسجّل الدخول على جهاز آخر، يمكنك الموافقة على الطلب داخل التطبيق.'}
            </Text>
          </View>
        </SafeAreaView>

        <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl }}>
          <Input
            labelAr={lang === 'fr' ? 'Adresse e-mail' : 'البريد الإلكتروني'}
            placeholder="example@una.mr"
            value={email}
            onChangeText={setEmail}
            icon="mailOutline"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            rtl={false}
          />

          <View style={[styles.infoBox, { backgroundColor: C.infoSurface, borderColor: C.border }]}>
            <AppIcon name="informationCircleOutline" size={16} color={C.primary} />
            <Text style={[styles.infoText, { color: C.textSecondary }]}>
              {lang === 'fr'
                ? "Si vous n'avez aucun appareil déjà connecté, contactez le support pour récupérer l'accès."
                : 'إذا لم يكن لديك أي جهاز مسجّل الدخول، تواصل مع الدعم لاسترجاع الوصول.'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => openWhatsAppSupport('Bonjour, j’ai oublié mon mot de passe Studara et je n’ai aucun appareil déjà connecté. Pouvez-vous m’aider ?')}
            activeOpacity={0.85}
            style={[styles.whatsBtn, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}
          >
            <AppIcon name="logoWhatsapp" size={18} color={Colors.secondary} />
            <Text style={[styles.whatsBtnText, { color: C.primary }]}>
              {lang === 'fr' ? 'Contacter le support WhatsApp' : 'التواصل مع دعم واتساب'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
            style={[styles.submitBtnOuter, { backgroundColor: C.primary, opacity: loading ? 0.65 : 1 }, Shadows.brand]}
          >
            {loading ? (
              <AppIcon name="reloadOutline" size={20} color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {lang === 'fr' ? 'Envoyer la demande' : 'إرسال الطلب'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.cancelRow}>
            <Text style={[styles.cancelText, { color: C.textMuted }]}>
              {lang === 'fr' ? 'Annuler' : 'إلغاء'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  doneCenter: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  doneCard: {
    borderRadius: BorderRadius.modal,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  doneIconOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  doneTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: Spacing.md, letterSpacing: -0.5 },
  doneSub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl, fontWeight: '500' },
  backBtnFilled: {
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 28,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
  },
  backBtnFilledText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  topBack: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroCard: {
    borderRadius: BorderRadius['3xl'],
    borderWidth: 1,
    padding: Spacing.xl,
    paddingLeft: Spacing.xl + 10,
    overflow: 'hidden',
    position: 'relative',
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
  backRowText: { fontSize: 14, fontWeight: '700' },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  heroTitle: { fontSize: 26, fontWeight: '900', marginBottom: 8, letterSpacing: -0.55 },
  heroSub: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    padding: 14,
    marginBottom: Spacing.lg,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 19, fontWeight: '600' },
  whatsBtn: {
    height: 52,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  whatsBtnText: { fontWeight: '900', fontSize: 14 },
  submitBtnOuter: {
    height: 54,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  cancelRow: { alignItems: 'center', paddingTop: Spacing.lg },
  cancelText: { fontSize: 14, fontWeight: '600' },
});

export default ForgotPasswordScreen;
