/**
 * Mon offre — plan catalogue + compteurs (/me/subscription, /me/usage)
 */
import React, { useCallback, useMemo, useState } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { apiRequest } from '../../utils/api';
import { Colors, BorderRadius, Spacing, Shadows, Gradients } from '../../theme';
import { safeBack } from '../../utils/safeBack';

interface SubscriptionSnap {
  status: string;
  planCode: string | null;
  planNameFr: string | null;
  currentPeriodEndAt: string | null;
  isStaffBypass?: boolean;
}

interface CounterRow {
  counterKey: string;
  remainingTotal: number;
  limitTotal: number;
  usedTotal: number;
}

const EMPTY_SUB: SubscriptionSnap = {
  status: 'none',
  planCode: null,
  planNameFr: null,
  currentPeriodEndAt: null,
  isStaffBypass: false,
};

function isNotFoundError(e: unknown): boolean {
  const err = e as Error & { status?: number };
  if (typeof err?.status === 'number' && err.status === 404) return true;
  const m = String(err?.message ?? '').toLowerCase();
  return m.includes('not found') || m.includes('404');
}

function humanizeLoadError(e: unknown, isAr: boolean): string {
  if (isNotFoundError(e)) return '';
  const m = String((e as Error)?.message ?? '');
  if (!m || m.startsWith('HTTP')) {
    return isAr ? 'تعذّر الاتصال بالخادم. تحقق من الشبكة ثم اسحب للتحديث.' : 'Impossible de joindre le serveur. Vérifiez le réseau puis tirez pour actualiser.';
  }
  return m.length > 120 ? (isAr ? 'خطأ غير متوقع' : 'Erreur inattendue') : m;
}

export default function MyPlanScreen() {
  const navigation = useNavigation();
  const { token } = useAuth();
  const { lang } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const { refetch: refetchGlobalSub } = useSubscription();
  const isAr = lang === 'ar';
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sub, setSub] = useState<SubscriptionSnap | null>(null);
  const [counters, setCounters] = useState<CounterRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    let nextSub: SubscriptionSnap = EMPTY_SUB;
    let nextCounters: CounterRow[] = [];
    let hardError: string | null = null;

    try {
      nextSub = await apiRequest<SubscriptionSnap>('/me/subscription', { token });
    } catch (e: unknown) {
      if (isNotFoundError(e)) {
        nextSub = EMPTY_SUB;
      } else {
        hardError = humanizeLoadError(e, isAr);
        nextSub = EMPTY_SUB;
      }
    }

    try {
      const u = await apiRequest<{ counters: CounterRow[] }>('/me/usage', { token });
      nextCounters = Array.isArray(u?.counters) ? u.counters : [];
    } catch (e: unknown) {
      if (!isNotFoundError(e) && !hardError) {
        hardError = humanizeLoadError(e, isAr);
      }
      nextCounters = [];
    }

    setSub(nextSub);
    setCounters(nextCounters);
    setError(hardError);
    setLoading(false);
    setRefreshing(false);
  }, [token, isAr]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      refetchGlobalSub(); // keep global gates in sync when opening this page
      load();
    }, [load, refetchGlobalSub]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const labelFor = (key: string) => {
    const fr: Record<string, string> = {
      ai_messages: 'Questions IA (restant aujourd’hui / fenêtre)',
      ocr_pages: 'Pages scan OCR (cycle)',
      pdf_analyses: 'Analyses PDF (cycle)',
      premium_answers: 'Réponses premium (cycle)',
    };
    const ar: Record<string, string> = {
      ai_messages: 'رسائل الذكاء الاصطناعي',
      ocr_pages: 'صفحات المسح OCR',
      pdf_analyses: 'تحليلات PDF',
      premium_answers: 'إجابات بريميوم',
    };
    return isAr ? (ar[key] ?? key) : (fr[key] ?? key);
  };

  const hasCatalogPlan = !!(sub?.planNameFr || sub?.isStaffBypass);
  const showSubscribeHints = !hasCatalogPlan && !error;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Profile' })} style={styles.backBtn} hitSlop={12}>
          <AppIcon name={isAr ? 'chevronForward' : 'chevronBack'} size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{isAr ? 'عَرْضِي' : 'Mon offre'}</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error ? (
            <View style={[styles.errorCard, { backgroundColor: isDark ? '#450a0a' : '#FEF2F2', borderColor: isDark ? '#7f1d1d' : '#FECACA' }]}>
              <AppIcon name="cloudOfflineOutline" size={22} color="#DC2626" />
              <Text style={[styles.errorText, { color: isDark ? '#fecaca' : '#991B1B' }]}>{error}</Text>
            </View>
          ) : null}

          <Text style={[styles.sectionKicker, { color: C.textSecondary }]}>{isAr ? 'الخطة' : 'Plan'}</Text>
          <View style={[styles.panel, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}>
            {sub?.isStaffBypass ? (
              <Text style={[styles.cardBody, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                {isAr ? 'حساب فريق' : 'Compte équipe'}
              </Text>
            ) : sub?.planNameFr ? (
              <>
                <Text style={[styles.planName, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>{sub.planNameFr}</Text>
                <Text style={[styles.muted, { textAlign: isAr ? 'right' : 'left' }]}>
                  {sub.planCode ? `${sub.planCode} · ` : ''}
                  {sub.status}
                </Text>
                {sub.currentPeriodEndAt ? (
                  <Text style={[styles.muted, { textAlign: isAr ? 'right' : 'left' }]}>
                    {isAr ? 'نهاية الفترة: ' : 'Fin de période : '}
                    {new Date(sub.currentPeriodEndAt).toLocaleDateString(isAr ? 'ar' : 'fr-FR')}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[styles.blockKicker, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left', marginBottom: 6 }]}>
                  {isAr ? 'اشتراك Studara+' : 'Abonnement Studara+'}
                </Text>
                <View style={[styles.emptyIconRow, { justifyContent: isAr ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? '#27272a' : '#F4F4F5' }]}>
                    <AppIcon name="layersOutline" size={22} color={C.textSecondary} />
                  </View>
                </View>
                <Text style={[styles.cardBody, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                  {isAr
                    ? 'لا يوجد اشتراك Studara+ نشط حالياً. اشترك لفتح مزايا إضافية وحدود أعلى.'
                    : 'Aucun abonnement Studara+ actif pour le moment. Abonne-toi pour débloquer plus de fonctionnalités et des limites plus hautes.'}
                </Text>
              </>
            )}

            {showSubscribeHints ? (
              <>
                <View style={[styles.panelDivider, { backgroundColor: C.border }]} />
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => (navigation as any).navigate('Paywall')}
                  style={styles.panelCtaInner}
                >
                  <LinearGradient
                    colors={Gradients.brand as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.panelCtaGrad, isAr ? { flexDirection: 'row-reverse' } : { flexDirection: 'row' }]}
                  >
                    <AppIcon name='sparkles' size={20} color="#fff" />
                    <Text style={styles.panelCtaText}>
                      {isAr ? 'اكتشف Studara+' : 'Découvrir Studara+'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          <Text style={[styles.sectionKicker, { color: C.textSecondary, marginTop: Spacing.lg }]}>
            {isAr ? 'الأرقام' : 'Compteurs'}
          </Text>
          <View style={[styles.panel, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}>
            {counters.length === 0 ? (
              <Text style={[styles.muted, { textAlign: isAr ? 'right' : 'left', lineHeight: 22 }]}>
                {hasCatalogPlan
                  ? (isAr
                    ? 'لا توجد نوافذ استخدام نشطة لهذا الاشتراك حالياً.'
                    : 'Aucune fenêtre d’usage active pour le moment.')
                  : (isAr
                    ? 'تظهر الأرقام تلقائياً عند تفعيل اشتراك الكتالوج على حسابك.'
                    : 'Les compteurs apparaissent lorsqu’un abonnement catalogue est actif.')}
              </Text>
            ) : (
              counters.map((c) => (
                <View
                  key={c.counterKey}
                  style={[
                    styles.row,
                    { borderBottomColor: isDark ? '#27272a' : '#E5E7EB' },
                    isAr ? { flexDirection: 'row-reverse' } : { flexDirection: 'row' },
                  ]}
                >
                  <Text style={[styles.rowLabel, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                    {labelFor(c.counterKey)}
                  </Text>
                  <Text style={[styles.rowVal, { color: Colors.primary }]}>
                    {c.remainingTotal} / {c.limitTotal || '—'}
                  </Text>
                </View>
              ))
            )}
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(C: typeof Colors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    backBtn: {
      width: 40, height: 40, borderRadius: 14,
      backgroundColor: C.surfaceVariant,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 19, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.3 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: Spacing.lg, paddingBottom: 48, flexGrow: 1 },
    errorCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      marginBottom: Spacing.lg,
    },
    errorText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    sectionKicker: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      marginBottom: Spacing.sm,
    },
    panel: {
      borderRadius: BorderRadius['2xl'],
      borderWidth: 1,
      padding: Spacing.lg,
      marginBottom: 0,
    },
    panelDivider: { height: 1, marginVertical: Spacing.md },
    panelCtaInner: {
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
      ...Shadows.brand,
    },
    panelCtaGrad: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 16,
      paddingHorizontal: Spacing.lg,
    },
    panelCtaText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
    cardBody: { fontSize: 15, lineHeight: 23, fontWeight: '500' },
    emptyIconRow: { width: '100%', flexDirection: 'row', marginBottom: Spacing.sm },
    emptyIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    planName: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
    muted: { fontSize: 13, color: C.textSecondary, marginTop: 4, fontWeight: '500' },
    row: {
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
    },
    rowLabel: { flex: 1, fontSize: 14, paddingHorizontal: 4, fontWeight: '600' },
    rowVal: { fontSize: 15, fontWeight: '800', minWidth: 80, textAlign: 'center' },
    blockKicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  });
}
