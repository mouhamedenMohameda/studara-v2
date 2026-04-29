import React, { useState } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { Input } from '../../components/common';
import { Colors, Gradients, Spacing, BorderRadius } from '../../theme';
import { apiRequest } from '../../utils/api';
import { safeBack } from '../../utils/safeBack';
import { openWhatsAppSupport } from '../../constants/support';

type Nav = StackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

const ForgotPasswordScreen = () => {
  const navigation = useNavigation<Nav>();
  const { lang } = useLanguage();

  const [email,       setEmail]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);

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
      // New secure flow: request intent only (no new password is sent here).
      // Ownership is proven by approving the intent from an already logged-in device.
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
      <LinearGradient colors={Gradients.brand as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
        <SafeAreaView style={[styles.fill, styles.center]}>
          <View style={styles.doneIconOuter}>
            <View style={styles.doneIcon}>
              <AppIcon name="checkmarkCircle" size={56} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.doneTitle}>
            {lang === 'fr' ? 'Demande envoyée ✅' : 'تم إرسال الطلب ✅'}
          </Text>
          <Text style={styles.doneSub}>
            {lang === 'fr'
              ? "Si un compte existe, une demande a été créée. Ouvrez Studara sur un appareil où vous êtes déjà connecté pour approuver la demande."
              : 'إذا كان الحساب موجودًا، تم إنشاء طلب. افتح Studara على جهاز مسجّل الدخول للموافقة على الطلب.'}
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.88}
          >
            <Text style={styles.backBtnText}>
              {lang === 'fr' ? 'Retour à la connexion' : 'العودة لتسجيل الدخول'}
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.primaryDeep }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={Gradients.brand}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.topPanel}
      >
        <SafeAreaView edges={['top']} style={styles.topInner}>
          <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Login' })} style={styles.backRow}>
            <AppIcon name={lang === 'ar' ? 'arrowForward' : 'arrowBack'} size={22} color="#fff" />
            <Text style={styles.backRowText}>
              {lang === 'fr' ? 'Retour' : 'رجوع'}
            </Text>
          </TouchableOpacity>
          <View style={styles.iconWrap}>
            <AppIcon name="keyOutline" size={40} color="rgba(255,255,255,0.9)" />
          </View>
          <Text style={styles.heroTitle}>
            {lang === 'fr' ? 'Mot de passe oublié ?' : 'نسيت كلمة المرور؟'}
          </Text>
          <Text style={styles.heroSub}>
            {lang === 'fr'
              ? "Entrez votre e-mail. Si vous êtes déjà connecté sur un autre appareil, vous pourrez approuver la demande directement dans l'app."
              : 'أدخل بريدك الإلكتروني. إذا كنت مسجّل الدخول على جهاز آخر، يمكنك الموافقة على الطلب داخل التطبيق.'}
          </Text>
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          removeClippedSubviews={false}
        >
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

          <View style={styles.infoBox}>
            <AppIcon name="informationCircleOutline" size={16} color="#4facfe" />
            <Text style={styles.infoText}>
              {lang === 'fr'
                ? "Si vous n'avez aucun appareil déjà connecté, contactez le support pour récupérer l'accès."
                : 'إذا لم يكن لديك أي جهاز مسجّل الدخول، تواصل مع الدعم لاسترجاع الوصول.'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => openWhatsAppSupport('Bonjour, j’ai oublié mon mot de passe Studara et je n’ai aucun appareil déjà connecté. Pouvez-vous m’aider ?')}
            activeOpacity={0.85}
            style={styles.whatsBtn}
          >
            <AppIcon name="logoWhatsapp" size={18} color="#16A34A" />
            <Text style={styles.whatsBtnText}>
              {lang === 'fr' ? 'Contacter le support WhatsApp' : 'التواصل مع دعم واتساب'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
            style={{ borderRadius: BorderRadius.pill, overflow: 'hidden', opacity: loading ? 0.65 : 1 }}
          >
            <LinearGradient
              colors={Gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitBtn}
            >
              {loading
                ? <AppIcon name="reloadOutline" size={20} color="#fff" />
                : <Text style={styles.submitBtnText}>
                    {lang === 'fr' ? 'Envoyer la demande' : 'إرسال الطلب'}
                  </Text>
              }
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={styles.cancelRow}
          >
            <Text style={styles.cancelText}>
              {lang === 'fr' ? 'Annuler' : 'إلغاء'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  fill:       { flex: 1 },
  center:     { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  topPanel:   { paddingBottom: 36 },
  topInner:   { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  backRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.lg },
  backRowText:{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  iconWrap:   {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  heroTitle:  { fontSize: 28, fontWeight: '900', color: '#fff', textAlign: 'right', marginBottom: 8, letterSpacing: -0.6 },
  heroSub:    { fontSize: 14, color: 'rgba(255,255,255,0.92)', textAlign: 'right', lineHeight: 22, fontWeight: '500' },
  sheet:      {
    flex: 1,
    zIndex: 1,
    elevation: 8,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    marginTop: -28,
  },
  handle:     { width: 44, height: 5, backgroundColor: Colors.border, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 6 },
  form:       { padding: Spacing.xl, paddingBottom: 40 },
  infoBox:    {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.infoSurface, borderWidth: 1, borderColor: '#BAE6FD',
    borderRadius: 14, padding: 12, marginBottom: Spacing.lg,
  },
  infoText:   { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 19, textAlign: 'right', fontWeight: '600' },
  whatsBtn: {
    height: 52,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  whatsBtnText: { color: '#166534', fontWeight: '900', fontSize: 14 },
  submitBtn:  { height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.pill },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  cancelRow:  { alignItems: 'center', paddingTop: Spacing.lg },
  cancelText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  // Done state
  doneIconOuter: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  doneIcon:   {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  doneTitle:  { fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: Spacing.md, letterSpacing: -0.6 },
  doneSub:    { fontSize: 14, color: 'rgba(255,255,255,0.92)', textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl, fontWeight: '500', maxWidth: 340 },
  backBtn:    {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 32, paddingVertical: 15,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  backBtnText:{ color: Colors.primary, fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
});

export default ForgotPasswordScreen;
