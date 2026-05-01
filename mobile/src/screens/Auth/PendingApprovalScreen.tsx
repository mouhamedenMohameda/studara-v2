import React from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, Linking, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Shadows } from '@/theme';
import { useTheme } from '../../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../types';

type Nav = StackNavigationProp<AuthStackParamList, 'PendingApproval'>;

// ── Change this to your WhatsApp number (international format, no +) ──────────
const WHATSAPP_NUMBER = '22236000000';  // e.g. 222XXXXXXXX for Mauritania

const PendingApprovalScreen = () => {
  const navigation = useNavigation<Nav>();
  const { colors: C, isDark } = useTheme();

  const openWhatsApp = () => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      'السلام عليكم، لقد سجّلت في تطبيق ستودارا وأنتظر تفعيل حسابي.'
    )}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}`);
    });
  };

  return (
    <View style={[styles.fill, { backgroundColor: C.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      {/* Decorative blobs — vert doux */}
      <View style={[styles.circleTop, { backgroundColor: C.primarySoft }]} />
      <View style={[styles.circleSmall, { backgroundColor: C.primarySurface }]} />
      <View style={[styles.circleAccent, { backgroundColor: Colors.secondary + '33' }]} />

      <SafeAreaView style={styles.fill}>
        <View style={styles.body}>

          <View style={[styles.iconOuter, { backgroundColor: C.primarySurface, borderWidth: 1, borderColor: C.primarySoft }]}>
            <View style={[styles.iconWrap, { backgroundColor: C.surface, borderColor: C.border }]}>
              <AppIcon name="hourglass" size={44} color={Colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: C.textPrimary }]}>حسابك قيد المراجعة</Text>
          <Text style={[styles.subtitle, { color: C.textSecondary }]}>
            تم إنشاء حسابك بنجاح! سيتم تفعيله بعد مراجعته من قِبل الإدارة.
          </Text>

          <View style={[styles.stepsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            {[
              { icon: '✅', text: 'تم استلام طلب التسجيل' },
              { icon: '⏳', text: 'تحت المراجعة من قِبل الإدارة' },
              { icon: '📱', text: 'ستتمكن من الدخول بعد الموافقة' },
            ].map((s, i) => (
              <View key={i} style={styles.step}>
                <Text style={styles.stepIcon}>{s.icon}</Text>
                <Text style={[styles.stepText, { color: C.textPrimary }]}>{s.text}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.waCard, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}>
            <Text style={[styles.waTitle, { color: C.textPrimary }]}>لتسريع المراجعة</Text>
            <Text style={[styles.waDesc, { color: C.textSecondary }]}>
              أرسل لنا رسالة على واتساب وسنفعّل حسابك في أقرب وقت.
            </Text>
            <TouchableOpacity style={styles.waBtn} onPress={openWhatsApp} activeOpacity={0.85}>
              <AppIcon name="logoWhatsapp" size={22} color="#fff" />
              <Text style={styles.waBtnText}>تواصل معنا على واتساب</Text>
            </TouchableOpacity>
          </View>

        </View>

        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
        >
          <AppIcon name="arrowBack" size={16} color={C.textMuted} />
          <Text style={[styles.backText, { color: C.textMuted }]}>العودة إلى تسجيل الدخول</Text>
        </TouchableOpacity>

      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },

  circleTop: {
    position: 'absolute', width: 320, height: 320, borderRadius: 160,
    top: -100, right: -100,
  },
  circleSmall: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    top: 80, left: -50,
  },
  circleAccent: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    bottom: 120, right: 40,
  },

  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconOuter: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    ...Shadows.xs,
  },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },

  title: {
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
    fontWeight: '500',
  },

  stepsCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    marginBottom: 20,
    ...Shadows.xs,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { fontSize: 20, width: 30, textAlign: 'center' },
  stepText: { fontSize: 14, flex: 1, textAlign: 'right', fontWeight: '600' },

  waCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    ...Shadows.xs,
  },
  waTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  waDesc: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 20,
    fontWeight: '500',
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#25D366',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    shadowColor: '#10B981',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  waBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  backText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default PendingApprovalScreen;
