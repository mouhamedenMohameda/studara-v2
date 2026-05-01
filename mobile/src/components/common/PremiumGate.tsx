/**
 * PremiumGate — écran blocage PAYG : chrome clair, accent par feature.
 */
import React from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadows, BorderRadius, Spacing } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

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
    chipColor: '#15803D',
  },
  ai_flashcards: {
    icon: 'cameraOutline', emoji: '📸',
    titleFr: 'Scan & Créer',
    titleAr: 'مسح وإنشاء',
    descFr: 'Photographiez vos notes et laissez l\'IA créer automatiquement un deck de flashcards.',
    descAr: 'صوّر ملاحظاتك ودع الذكاء الاصطناعي ينشئ بطاقات تعليمية تلقائياً.',
    priceFr: '10 Ouguiya / utilisation',
    priceAr: '10 أوقية / استخدام',
    chipColor: '#CA8A04',
  },
  ai_course: {
    icon: 'schoolOutline', emoji: '📚',
    titleFr: 'Cours IA',
    titleAr: 'درس ذكاء اصطناعي',
    descFr: 'Génération automatique d\'un cours complet enrichi par Wikipedia à partir de votre transcription.',
    descAr: 'توليد درس كامل مُعزَّز بمعلومات من ويكيبيديا انطلاقاً من النص المُحوَّل.',
    priceFr: '20 Ouguiya / utilisation',
    priceAr: '20 أوقية / استخدام',
    chipColor: '#D97706',
  },
};

export default function PremiumGate({ featureKey, loading, hasAccess, balanceMru, navigation, onBack, children, lang }: Props) {
  const isAr = lang === 'ar';
  const meta = FEATURE_META[featureKey] ?? FEATURE_META.whisper_studio;
  const { colors: C } = useTheme();

  if (loading) {
    return (
      <View style={[styles.fillCenter, { backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={[styles.fill, { backgroundColor: C.background }]}>
        <SafeAreaView style={styles.fill}>
          <TouchableOpacity
            onPress={onBack ?? (() => navigation.goBack())}
            style={[styles.backBtn, { backgroundColor: C.surface, borderColor: C.border }]}
            activeOpacity={0.8}
          >
            <AppIcon name="arrowBack" size={22} color={C.textPrimary} />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.centerContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.heroCard, { backgroundColor: C.surface, borderColor: C.borderLight }, Shadows.sm]}>
              <View style={[styles.accentTop, { backgroundColor: meta.chipColor }]} />

              <View style={[styles.lockCircleOuter, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}>
                <View style={[styles.lockCircle, { backgroundColor: C.surface }]}>
                  <AppIcon name="lockClosed" size={32} color={meta.chipColor} />
                </View>
              </View>

              <Text style={styles.emoji}>{meta.emoji}</Text>
              <Text style={[styles.title, { color: C.textPrimary }, isAr && styles.rtl]}>
                {isAr ? meta.titleAr : meta.titleFr}
              </Text>
              <Text style={[styles.desc, { color: C.textSecondary }, isAr && styles.rtl]}>
                {isAr ? meta.descAr : meta.descFr}
              </Text>

              <View style={[styles.priceBadge, { backgroundColor: `${meta.chipColor}14`, borderColor: `${meta.chipColor}40` }]}>
                <AppIcon name="wallet" size={16} color={meta.chipColor} />
                <Text style={[styles.priceText, { color: meta.chipColor }]}>
                  {isAr ? meta.priceAr : meta.priceFr}
                </Text>
              </View>

              {balanceMru > 0 && (
                <View style={[styles.balanceBadge, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
                  <AppIcon name="cashOutline" size={13} color={C.primary} />
                  <Text style={[styles.balanceText, { color: C.textPrimary }]}>
                    {isAr ? `رصيدك: ${balanceMru} أوقية` : `Votre solde : ${balanceMru} Ouguiya`}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.ctaBtn, { backgroundColor: C.primary }, Shadows.brand]}
                onPress={() => {
                  const nav = navigation.getParent?.() ?? navigation;
                  nav.navigate('BillingHub');
                }}
                activeOpacity={0.85}
              >
                <AppIcon name="addCircle" size={22} color="#fff" />
                <Text style={styles.ctaText}>
                  {isAr ? 'شحن المحفظة والوصول' : 'Recharger et accéder'}
                </Text>
              </TouchableOpacity>

              <View style={[styles.howBox, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
                <Text style={[styles.howTitle, { color: C.textPrimary }, isAr && styles.rtl]}>
                  {isAr ? 'كيف يعمل؟' : 'Comment ça marche ?'}
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
                    <Text style={[styles.howText, { color: C.textSecondary }, isAr && styles.rtl]}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fillCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: {
    marginTop: 8, marginLeft: 16,
    width: 44, height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  centerContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    paddingBottom: 32,
  },
  heroCard: {
    borderRadius: BorderRadius.modal,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: Spacing.xl,
  },
  accentTop: {
    height: 4,
    width: '100%',
  },
  lockCircleOuter: {
    width: 88, height: 88, borderRadius: 44,
    alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.xl,
    marginBottom: 8,
    borderWidth: 1,
  },
  lockCircle: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center',
    ...Shadows.xs,
  },
  emoji: {
    fontSize: 36, alignSelf: 'center', marginBottom: 8,
  },
  title: {
    fontSize: 26, fontWeight: '900',
    textAlign: 'center', marginBottom: 10,
    letterSpacing: -0.55,
    paddingHorizontal: Spacing.sm,
  },
  desc: {
    fontSize: 15,
    textAlign: 'center', lineHeight: 22, marginBottom: 18,
    maxWidth: 360,
    alignSelf: 'center',
    paddingHorizontal: Spacing.sm,
  },
  priceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 999, marginBottom: 12,
    borderWidth: 1,
  },
  priceText: {
    fontSize: 15, fontWeight: '800', letterSpacing: 0.2,
  },
  balanceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginBottom: 16,
    borderWidth: 1,
  },
  balanceText: {
    fontSize: 13, fontWeight: '700',
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    alignSelf: 'center',
    paddingHorizontal: 24, paddingVertical: 15,
    borderRadius: 999, marginBottom: 22,
  },
  ctaText: {
    fontSize: 15, fontWeight: '800', letterSpacing: 0.2, color: '#fff',
  },
  howBox: {
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.card, padding: 18,
    borderWidth: 1,
  },
  howTitle: {
    fontWeight: '800', fontSize: 15, marginBottom: 12,
    textAlign: 'left', letterSpacing: 0.2,
  },
  howRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8,
  },
  howNum: { fontSize: 16 },
  howText: {
    fontSize: 13, flex: 1,
    textAlign: 'left', lineHeight: 19, fontWeight: '600',
  },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
