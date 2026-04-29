import React from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../types';

type Nav = StackNavigationProp<AuthStackParamList, 'PendingApproval'>;

// ── Change this to your WhatsApp number (international format, no +) ──────────
const WHATSAPP_NUMBER = '22236000000';  // e.g. 222XXXXXXXX for Mauritania

const PendingApprovalScreen = () => {
  const navigation = useNavigation<Nav>();

  const openWhatsApp = () => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      'السلام عليكم، لقد سجّلت في تطبيق ستودارا وأنتظر تفعيل حسابي.'
    )}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}`);
    });
  };

  return (
    <LinearGradient
      colors={['#5B21B6', '#7C3AED', '#EC4899']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>

        {/* Decorative circle top */}
        <View style={styles.circleTop} />
        <View style={styles.circleSmall} />
        <View style={styles.circleAccent} />

        <View style={styles.body}>

          <View style={styles.iconOuter}>
            <View style={styles.iconWrap}>
              <AppIcon name='hourglass' size={44} color="#FFFFFF" />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>حسابك قيد المراجعة</Text>
          <Text style={styles.subtitle}>
            تم إنشاء حسابك بنجاح! سيتم تفعيله بعد مراجعته من قِبل الإدارة.
          </Text>

          {/* Steps */}
          <View style={styles.stepsCard}>
            {[
              { icon: '✅', text: 'تم استلام طلب التسجيل' },
              { icon: '⏳', text: 'تحت المراجعة من قِبل الإدارة' },
              { icon: '📱', text: 'ستتمكن من الدخول بعد الموافقة' },
            ].map((s, i) => (
              <View key={i} style={styles.step}>
                <Text style={styles.stepIcon}>{s.icon}</Text>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            ))}
          </View>

          {/* WhatsApp CTA */}
          <View style={styles.waCard}>
            <Text style={styles.waTitle}>لتسريع المراجعة</Text>
            <Text style={styles.waDesc}>
              أرسل لنا رسالة على واتساب وسنفعّل حسابك في أقرب وقت.
            </Text>
            <TouchableOpacity style={styles.waBtn} onPress={openWhatsApp} activeOpacity={0.85}>
              <AppIcon name="logoWhatsapp" size={22} color="#fff" />
              <Text style={styles.waBtnText}>تواصل معنا على واتساب</Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* Back to login */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
        >
          <AppIcon name="arrowBack" size={16} color="rgba(255,255,255,0.5)" />
          <Text style={styles.backText}>العودة إلى تسجيل الدخول</Text>
        </TouchableOpacity>

      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },

  circleTop: {
    position: 'absolute', width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(255,255,255,0.10)', top: -100, right: -100,
  },
  circleSmall: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)', top: 80, left: -50,
  },
  circleAccent: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(253,230,138,0.28)', bottom: 120, right: 40,
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
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
    fontWeight: '500',
  },

  stepsCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: 18,
    gap: 14,
    marginBottom: 20,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { fontSize: 20, width: 30, textAlign: 'center' },
  stepText: { fontSize: 14, color: '#FFFFFF', flex: 1, textAlign: 'right', fontWeight: '600' },

  waCard: {
    width: '100%',
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.45)',
    padding: 22,
    alignItems: 'center',
  },
  waTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  waDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.90)',
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
    color: 'rgba(255,255,255,0.80)',
    fontWeight: '600',
  },
});

export default PendingApprovalScreen;
