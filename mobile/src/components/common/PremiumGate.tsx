/**
 * PremiumGate — Full-screen lock overlay (v2 vibrant)
 * Redirects to PremiumRequestScreen on CTA.
 */
import React from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  featureKey: string;
  loading: boolean;
  hasAccess: boolean;
  balanceMru: number;
  navigation: any;
  onBack?: () => void;
  children: React.ReactNode;
  lang?: string;
}

const FEATURE_META: Record<string, {
  icon: string; emoji: string;
  titleFr: string; titleAr: string;
  descFr: string; descAr: string;
  priceFr: string; priceAr: string;
  gradient: readonly [string, string, string];
  chipColor: string;
}> = {
  whisper_studio: {
    icon: 'micOutline', emoji: '🎙️',
    titleFr: 'Whisper Studio',
    titleAr: 'ستوديو ويسبر',
    descFr: 'Transcription IA de vos notes vocales, résumés, réécriture et génération de cours enrichis.',
    descAr: 'تحويل ملاحظاتك الصوتية إلى نص، ملخصات، وإعادة صياغة، وإنشاء دروس مدعومة بالذكاء الاصطناعي.',
    priceFr: '5 Ouguiya / utilisation',
    priceAr: '5 أوقية / استخدام',
    gradient: ['#8B5CF6', '#7C3AED', '#5B21B6'] as const,
    chipColor: '#7C3AED',
  },
  ai_flashcards: {
    icon: 'cameraOutline', emoji: '📸',
    titleFr: 'Scan & Créer',
    titleAr: 'مسح وإنشاء',
    descFr: 'Photographiez vos notes et laissez l\'IA créer automatiquement un deck de flashcards.',
    descAr: 'صوّر ملاحظاتك ودع الذكاء الاصطناعي ينشئ بطاقات تعليمية تلقائياً.',
    priceFr: '10 Ouguiya / utilisation',
    priceAr: '10 أوقية / استخدام',
    gradient: ['#EC4899', '#7C3AED', '#4C1D95'] as const,
    chipColor: '#7C3AED',
  },
  ai_course: {
    icon: 'schoolOutline', emoji: '📚',
    titleFr: 'Cours IA',
    titleAr: 'درس ذكاء اصطناعي',
    descFr: 'Génération automatique d\'un cours complet enrichi par Wikipedia à partir de votre transcription.',
    descAr: 'توليد درس كامل مُعزَّز بمعلومات من ويكيبيديا انطلاقاً من النص المُحوَّل.',
    priceFr: '20 Ouguiya / utilisation',
    priceAr: '20 أوقية / استخدام',
    gradient: ['#FDE68A', '#F59E0B', '#B45309'] as const,
    chipColor: '#B45309',
  },
};

export default function PremiumGate({ featureKey, loading, hasAccess, balanceMru, navigation, onBack, children, lang }: Props) {
  const isAr = lang === 'ar';
  const meta = FEATURE_META[featureKey] ?? FEATURE_META.whisper_studio;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFB' }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={meta.gradient as any} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <SafeAreaView style={{ flex: 1 }}>
            <TouchableOpacity
              onPress={onBack ?? (() => navigation.goBack())}
              style={styles.backBtn}
              activeOpacity={0.8}
            >
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>

            <View style={styles.centerContent}>
              <View style={styles.lockCircleOuter}>
                <View style={styles.lockCircle}>
                  <AppIcon name="lockClosed" size={36} color="#fff" />
                </View>
              </View>

              <Text style={styles.emoji}>{meta.emoji}</Text>
              <Text style={[styles.title, isAr && styles.rtl]}>
                {isAr ? meta.titleAr : meta.titleFr}
              </Text>
              <Text style={[styles.desc, isAr && styles.rtl]}>
                {isAr ? meta.descAr : meta.descFr}
              </Text>

              <View style={styles.priceBadge}>
                <AppIcon name='wallet' size={16} color={meta.chipColor} />
                <Text style={[styles.priceText, { color: meta.chipColor }]}>
                  {isAr ? meta.priceAr : meta.priceFr}
                </Text>
              </View>

              {balanceMru > 0 && (
                <View style={styles.balanceBadge}>
                  <AppIcon name="cashOutline" size={13} color="#fff" />
                  <Text style={styles.balanceText}>
                    {isAr ? `رصيدك: ${balanceMru} أوقية` : `Votre solde : ${balanceMru} Ouguiya`}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.ctaBtn}
                onPress={() => {
                  const nav = navigation.getParent?.() ?? navigation;
                  nav.navigate('PremiumRequest', { featureKey });
                }}
                activeOpacity={0.85}
              >
                <AppIcon name="addCircle" size={22} color={meta.chipColor} />
                <Text style={[styles.ctaText, { color: meta.chipColor }]}>
                  {isAr ? '💳 شحن المحفظة والوصول' : '💳 Recharger & accéder'}
                </Text>
              </TouchableOpacity>

              <View style={styles.howBox}>
                <Text style={[styles.howTitle, isAr && styles.rtl]}>
                  {isAr ? '⚡ كيف يعمل؟' : '⚡ Comment ça marche ?'}
                </Text>
                {[
                  isAr
                    ? ['1️⃣', 'ادفع عبر Bankily أو Sedad أو Masrivy']
                    : ['1️⃣', 'Payez via Bankily, Sedad ou Masrivy'],
                  isAr
                    ? ['2️⃣', 'أرسل لقطة شاشة الإيصال']
                    : ['2️⃣', 'Envoyez le reçu de paiement'],
                  isAr
                    ? ['3️⃣', 'يُفعَّل حسابك فوراً بعد المراجعة']
                    : ['3️⃣', 'Votre accès est activé après validation'],
                ].map(([num, text], i) => (
                  <View key={i} style={[styles.howRow, isAr && { flexDirection: 'row-reverse' }]}>
                    <Text style={styles.howNum}>{num}</Text>
                    <Text style={[styles.howText, isAr && styles.rtl]}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  backBtn: {
    marginTop: 8, marginLeft: 16,
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  centerContent: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: 28, paddingTop: 20,
  },
  lockCircleOuter: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  lockCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  emoji: {
    fontSize: 44, marginBottom: 8,
  },
  title: {
    fontSize: 30, fontWeight: '900', color: '#fff',
    textAlign: 'center', marginBottom: 10,
    letterSpacing: -0.6,
  },
  desc: {
    fontSize: 15, color: 'rgba(255,255,255,0.92)',
    textAlign: 'center', lineHeight: 22, marginBottom: 20,
    maxWidth: 340,
  },
  priceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 999, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  priceText: {
    fontSize: 15, fontWeight: '800', letterSpacing: 0.2,
  },
  balanceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, marginBottom: 16,
  },
  balanceText: {
    color: '#fff', fontSize: 13, fontWeight: '700',
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 24, paddingVertical: 15,
    borderRadius: 999, marginBottom: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 14, elevation: 8,
  },
  ctaText: {
    fontSize: 15, fontWeight: '800', letterSpacing: 0.2,
  },
  howBox: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 20, padding: 18, width: '100%',
  },
  howTitle: {
    color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: 10,
    textAlign: 'left', letterSpacing: 0.2,
  },
  howRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8,
  },
  howNum: { fontSize: 16 },
  howText: {
    color: 'rgba(255,255,255,0.92)', fontSize: 13, flex: 1,
    textAlign: 'left', lineHeight: 19, fontWeight: '600',
  },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
