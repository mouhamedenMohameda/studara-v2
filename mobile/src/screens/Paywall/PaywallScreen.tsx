/**
 * PaywallScreen — offres Studara+ depuis le catalogue API (`/catalog/subscriptions`),
 * avec secours local si le serveur ne répond pas encore (404).
 */
import React, { useState, useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';

import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiRequest } from '../../utils/api';
import { RootStackParamList } from '../../types';
import { Colors } from '../../theme';
import {
  PaywallCatalogPlan,
  normalizeCatalogPayload,
  PAYWALL_CATALOG_FALLBACK,
  PLAN_SELLING_COPY,
} from './catalogData';

type Nav = StackNavigationProp<RootStackParamList, 'Paywall'>;

const PLAN_GRADIENT: Record<string, [string, string]> = {
  essential:     ['#6D28D9', '#4F46E5'],
  course_pdf:    ['#059669', '#0D9488'],
  elite_pass_7d: ['#D97706', '#EA580C'],
  elite_monthly: ['#DC2626', '#7C2D12'],
};

function planGradient(code: string): [string, string] {
  return PLAN_GRADIENT[code] ?? ['#6D28D9', '#4F46E5'];
}

function pricePeriodLabel(plan: PaywallCatalogPlan, isAr: boolean): string {
  if (plan.code === 'elite_pass_7d') {
    return isAr ? 'أوقية / ٧ أيام' : 'MRU / 7 jours';
  }
  return isAr ? 'أوقية / شهر' : 'MRU / mois';
}

/** Libellé principal sous le gros chiffre « jours restants » (grammaire correcte). */
function daysRemainingTitle(days: number, isAr: boolean): string {
  if (days <= 0) return '';
  if (isAr) {
    if (days === 1) return 'يوم متبقي';
    if (days === 2) return 'يومان متبقيان';
    if (days >= 3 && days <= 10) return `${days} أيام متبقية`;
    return `${days} يوماً متبقياً تقريباً`;
  }
  return days === 1 ? 'jour restant' : 'jours restants';
}

/** Relie la date de fin au nombre affiché (évite l’impression de contradiction année / jours). */
function accessEndExplanation(days: number, dateStr: string | null, isAr: boolean): string | null {
  if (!dateStr || days <= 0) return null;
  if (isAr) {
    return `ينتهي الوصول الحالي في ${dateStr} — ما يعادل حوالي ${days} ${days === 1 ? 'يوماً كاملاً' : 'أيام كاملة'} على التقويم.`;
  }
  return `Fin d’accès prévue le ${dateStr} (environ ${days} jour${days > 1 ? 's' : ''} civil restant${days > 1 ? 's' : ''}).`;
}

function catalogLoadErrorMessage(err: Error & { status?: number }, isAr: boolean): string {
  const status = err.status;
  const raw = (err.message || '').trim();
  const net =
    /network request failed|failed to fetch|load failed|internet|connexion/i.test(raw) ||
    raw === 'Network request failed';

  if (net) {
    return isAr
      ? 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجدداً.'
      : 'Connexion au serveur impossible. Vérifie ta connexion et réessaie.';
  }
  if (status === 500 || status === 503) {
    if (raw && raw.length < 120 && !raw.startsWith('HTTP')) {
      return isAr ? `خطأ خادم: ${raw}` : `Erreur serveur : ${raw}`;
    }
    return isAr
      ? 'الخادم غير متاح مؤقتاً. حاول لاحقاً.'
      : 'Le serveur est temporairement indisponible. Réessaie plus tard.';
  }
  if (status === 401 || status === 403) {
    return isAr ? 'غير مصرّح بعرض العروض.' : 'Accès au catalogue refusé.';
  }
  if (raw && raw.length < 100) {
    return isAr ? raw : raw;
  }
  return isAr ? 'تعذّر تحميل العروض.' : 'Impossible de charger les offres.';
}

export default function PaywallScreen() {
  const navigation = useNavigation<Nav>();
  const { subscription, refetch } = useSubscription();
  const { logout, token } = useAuth();
  const { isAr, isRTL } = useLanguage();
  /** Direction flex pour tout le bloc (onglets / cartes gèrent les cas particuliers). */
  const layoutDirection: 'ltr' | 'rtl' = isRTL ? 'rtl' : 'ltr';
  /** Sens d’écriture du texte selon la langue affichée sur la ligne (évite l’arabe en LTR ou le français en RTL incorrect). */
  const textDir = (arabicContent: boolean): 'ltr' | 'rtl' => (arabicContent ? 'rtl' : 'ltr');

  const [catalog, setCatalog] = useState<PaywallCatalogPlan[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const applyCatalogRows = useCallback((rows: PaywallCatalogPlan[]) => {
    const sorted = [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    setCatalog(sorted);
    setSelectedCode((prev) => {
      if (!sorted.length) return null;
      if (prev && sorted.some((p) => p.code === prev)) return prev;
      const preferred = sorted.find((p) => p.code === 'course_pdf') ?? sorted[0];
      return preferred.code;
    });
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogWarning(null);
    try {
      const raw = await apiRequest<unknown>('/catalog/subscriptions', { token: token ?? undefined });
      const normalized = normalizeCatalogPayload(raw);
      if (normalized.length) {
        applyCatalogRows(normalized);
        return;
      }
      applyCatalogRows(PAYWALL_CATALOG_FALLBACK);
      setCatalogWarning(
        isAr
          ? 'الخادم أرسل قائمة فارغة — عرض أسعار تقريبية. راسِل الدعم للتأكد.'
          : 'Le serveur a renvoyé une liste vide — affichage d’une grille indicative. Contacte le support pour confirmer.',
      );
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      if (err.status === 404) {
        applyCatalogRows(PAYWALL_CATALOG_FALLBACK);
        setCatalogWarning(
          isAr
            ? 'الخادم لم يُحدَّث بعد (مسار الكتالوج غير موجود). الأسعار المعروضة من التطبيق — راسِلنا للتأكد.'
            : 'Le serveur n’expose pas encore le catalogue (404). Tarifs indicatifs intégrés à l’app — écris-nous pour confirmer.',
        );
        return;
      }
      setCatalog([]);
      setCatalogError(catalogLoadErrorMessage(err, isAr));
    } finally {
      setCatalogLoading(false);
    }
  }, [token, isAr, applyCatalogRows]);

  useFocusEffect(
    useCallback(() => {
      // Ensure we refresh the current access status when opening the paywall.
      // This prevents needing an app restart after an admin validates a subscription.
      refetch();
      loadCatalog();
    }, [loadCatalog, refetch]),
  );

  const daysLeft = subscription?.daysLeft ?? 0;
  const acceptedUploads = subscription?.acceptedUploadsCount ?? 0;
  const bonusDays = subscription?.bonusDays ?? 0;
  const status = subscription?.status ?? 'expired';
  const effectiveUntil = subscription?.effectiveUntil
    ? new Date(subscription.effectiveUntil).toLocaleDateString(isAr ? 'ar' : 'fr-FR')
    : null;

  const statusLabel =
    status === 'trial' ? (isAr ? 'تجريبي' : 'Essai') :
    status === 'active' ? (isAr ? 'مشترك' : 'Actif') :
    status === 'cancelled' ? (isAr ? 'ملغى' : 'Annulé') :
    (isAr ? 'منتهي' : 'Expiré');

  const statusColor =
    status === 'trial' ? '#D97706' :
    status === 'active' ? Colors.primary :
    '#DC2626';

  const currentPlan = catalog.find((p) => p.code === selectedCode) ?? catalog[0];
  const grad = currentPlan ? planGradient(currentPlan.code) : planGradient('essential');
  const selling = currentPlan ? PLAN_SELLING_COPY[currentPlan.code] : undefined;

  const handleContactUs = (plan: PaywallCatalogPlan) => {
    const subject = `Studara+ — ${plan.displayNameFr} (${plan.monthlyPriceMru} MRU)`;
    Linking.openURL(`mailto:support@studara.app?subject=${encodeURIComponent(subject)}`);
  };

  const textAlign = isRTL ? 'right' : 'left';
  const daysTitle = daysRemainingTitle(daysLeft, isAr);
  const daysExplain = accessEndExplanation(daysLeft, effectiveUntil, isAr);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#8B5CF6', '#EC4899', '#F97316']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerIcon}>📚</Text>
          <Text style={styles.headerTitle}>Studara+</Text>
          <Text
            style={[
              styles.headerSub,
              { textAlign: 'center', writingDirection: textDir(isAr) },
            ]}
          >
            {isAr ? 'اشتراك الذكاء الاصطناعي للدراسة' : 'Abonnements IA pour étudier'}
          </Text>

          <View
            style={[
              styles.statusChip,
              { backgroundColor: statusColor + '33', borderColor: statusColor, direction: layoutDirection },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor, writingDirection: textDir(isAr) }]}>
              {status === 'expired' ? '⚠️' : status === 'active' ? '✅' : '⏳'} {statusLabel}
            </Text>
          </View>
        </LinearGradient>

        <View
          style={[
            styles.infoBanner,
            { borderColor: isAr ? '#C4B5FD' : '#A5B4FC', direction: layoutDirection },
          ]}
        >
          <AppIcon name="informationCircleOutline" size={22} color="#4F46E5" />
          <Text
            style={[
              styles.infoBannerText,
              { textAlign, writingDirection: textDir(isAr) },
            ]}
          >
            {isAr
              ? 'اختر أحد العروض أدناه ثم راسلنا لتفعيل الاشتراك (الدفع والتفعيل مع الفريق).'
              : 'Choisis une offre ci-dessous puis écris-nous pour activer ton abonnement (paiement et mise en place avec l’équipe).'}
          </Text>
        </View>

        {daysLeft > 0 ? (
          <View style={[styles.daysCard, { borderColor: Colors.primary }]}>
            <Text style={[styles.daysNumber, { writingDirection: 'ltr' }]}>{daysLeft}</Text>
            <Text style={[styles.daysLabel, { writingDirection: textDir(isAr) }]}>{daysTitle}</Text>
            {daysExplain && (
              <Text
                style={[
                  styles.daysUntil,
                  { textAlign: isRTL ? 'right' : 'left', writingDirection: textDir(isAr) },
                ]}
              >
                {daysExplain}
              </Text>
            )}
          </View>
        ) : (
          <View style={[styles.daysCard, { borderColor: '#DC2626' }]}>
            <Text style={[styles.daysNumber, { color: '#DC2626', writingDirection: 'ltr' }]}>0</Text>
            <Text
              style={[styles.daysLabel, { color: '#DC2626', writingDirection: textDir(isAr) }]}
            >
              {isAr ? 'لا أيام اشتراك متبقية' : 'Aucun jour d’abonnement restant'}
            </Text>
          </View>
        )}

        {catalogWarning && (
          <View style={[styles.warnBanner, { borderColor: '#F59E0B', direction: layoutDirection }]}>
            <AppIcon name="warningOutline" size={22} color="#B45309" />
            <Text style={[styles.warnBannerText, { textAlign, writingDirection: textDir(isAr) }]}>
              {catalogWarning}
            </Text>
          </View>
        )}

        {catalogLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text
              style={[
                styles.muted,
                { textAlign: 'center', marginTop: 12, writingDirection: textDir(isAr) },
              ]}
            >
              {isAr ? 'جاري تحميل العروض…' : 'Chargement des offres…'}
            </Text>
          </View>
        ) : catalogError ? (
          <View style={styles.centerPad}>
            <Text
              style={[
                styles.errorText,
                { textAlign: 'center', writingDirection: textDir(isAr) },
              ]}
            >
              {catalogError}
            </Text>
            <TouchableOpacity onPress={loadCatalog} style={styles.retryBtn}>
              <Text style={[styles.retryBtnText, { writingDirection: textDir(isAr) }]}>
                {isAr ? 'إعادة المحاولة' : 'Réessayer'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : !catalog.length ? (
          <View style={styles.centerPad}>
            <Text
              style={[styles.muted, { textAlign: 'center', writingDirection: textDir(isAr) }]}
            >
              {isAr ? 'لا توجد عروض متاحة حالياً.' : 'Aucune offre catalogue pour le moment.'}
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.planTabsRow,
                isRTL && { flexDirection: 'row-reverse' },
              ]}
            >
              {catalog.map((plan) => {
                const active = plan.code === selectedCode;
                return (
                  <TouchableOpacity
                    key={plan.code}
                    style={[styles.planTab, active && styles.planTabActive]}
                    onPress={() => setSelectedCode(plan.code)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.planTabText,
                        active && styles.planTabTextActive,
                        { writingDirection: 'ltr' },
                      ]}
                      numberOfLines={2}
                    >
                      {plan.displayNameFr.replace(/^Studara\s+/i, '').trim()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {currentPlan && (
              <View style={styles.planCard}>
                <LinearGradient
                  colors={grad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.planCardHeader, isRTL && styles.planCardHeaderRtl]}
                >
                  {currentPlan.code === 'course_pdf' && (
                    <View
                      style={[
                        styles.planBadge,
                        { backgroundColor: 'rgba(255,255,255,0.25)' },
                        isRTL && styles.planBadgeRtl,
                      ]}
                    >
                      <Text style={[styles.planBadgeText, { writingDirection: textDir(isAr) }]}>
                        {isAr ? 'الأكثر اختياراً' : 'Le plus choisi'}
                      </Text>
                    </View>
                  )}

                  <Text
                    style={[
                      styles.planLabel,
                      styles.planLabelFullWidth,
                      { textAlign: isRTL ? 'right' : 'left', writingDirection: 'ltr' },
                    ]}
                  >
                    {currentPlan.displayNameFr}
                  </Text>

                  <View style={[styles.planPriceRow, isRTL && styles.planPriceRowRtl]}>
                    <Text style={[styles.planPrice, { writingDirection: 'ltr' }]}>
                      {String(currentPlan.monthlyPriceMru)}
                    </Text>
                    <Text style={[styles.planPer, { writingDirection: 'ltr' }]}> MRU</Text>
                  </View>
                  <Text
                    style={[
                      styles.planPerSub,
                      styles.planLabelFullWidth,
                      { textAlign: isRTL ? 'right' : 'left', writingDirection: textDir(isAr) },
                    ]}
                  >
                    {pricePeriodLabel(currentPlan, isAr)}
                  </Text>
                </LinearGradient>

                <View style={styles.planFeatures}>
                  <Text
                    style={[
                      styles.featuresKicker,
                      { textAlign, writingDirection: textDir(isAr) },
                      isAr ? { textTransform: 'none' } : null,
                    ]}
                  >
                    {isAr ? 'ماذا يمنحك هذا العرض؟' : 'Ce que débloque cette offre'}
                  </Text>
                  {selling ? (
                    <>
                      <Text
                        style={[
                          styles.planTagline,
                          { textAlign, writingDirection: textDir(isAr) },
                        ]}
                      >
                        {isAr ? selling.taglineAr : selling.taglineFr}
                      </Text>
                      <View style={styles.bulletList}>
                        {(isAr ? selling.bulletsAr : selling.bulletsFr).map((line, idx) => (
                          <View key={idx} style={styles.bulletRow}>
                            {isRTL ? (
                              <>
                                <Text
                                  style={[
                                    styles.bulletText,
                                    {
                                      textAlign: 'right',
                                      writingDirection: 'rtl',
                                    },
                                  ]}
                                >
                                  {line}
                                </Text>
                                <AppIcon name="checkmarkCircle"
                                  size={20}
                                  color={grad[0]}
                                  style={styles.bulletIcon}
                                />
                              </>
                            ) : (
                              <>
                                <AppIcon name="checkmarkCircle"
                                  size={20}
                                  color={grad[0]}
                                  style={styles.bulletIcon}
                                />
                                <Text
                                  style={[
                                    styles.bulletText,
                                    {
                                      textAlign: 'left',
                                      writingDirection: 'ltr',
                                    },
                                  ]}
                                >
                                  {line}
                                </Text>
                              </>
                            )}
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Text
                      style={[
                        styles.featureLead,
                        { textAlign, writingDirection: 'ltr' },
                      ]}
                    >
                      {currentPlan.descriptionFr}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.ctaBtn}
                  onPress={() => handleContactUs(currentPlan)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={grad}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ctaBtnGrad}
                  >
                    <Text
                      style={[
                        styles.ctaBtnText,
                        { writingDirection: textDir(isAr), textAlign: 'center' },
                      ]}
                    >
                      {isAr ? '📧 طلب هذا العرض' : '📧 Demander ce forfait'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { textAlign, writingDirection: textDir(isAr) }]}>
            {isAr ? '🎁 أيام مجانية' : '🎁 Jours bonus'}
          </Text>
          <View style={styles.bonusRow}>
            <View style={styles.bonusStat}>
              <Text style={[styles.bonusNum, { writingDirection: 'ltr' }]}>{acceptedUploads}</Text>
              <Text style={[styles.bonusLbl, { writingDirection: textDir(isAr) }]}>
                {isAr ? 'ملف مقبول' : 'Fichiers acceptés'}
              </Text>
            </View>
            <View style={styles.bonusDivider} />
            <View style={styles.bonusStat}>
              <Text style={[styles.bonusNum, { color: Colors.primary, writingDirection: 'ltr' }]}>
                {bonusDays}
              </Text>
              <Text style={[styles.bonusLbl, { writingDirection: textDir(isAr) }]}>
                {isAr ? 'أيام مكتسبة' : 'Jours gagnés'}
              </Text>
            </View>
          </View>
          <View style={styles.bonusInfo}>
            <Text style={[styles.bonusInfoText, { textAlign, writingDirection: textDir(isAr) }]}>
              {isAr
                ? 'كل ملف ترفعه ويقبل يمنحك يوماً إضافياً على اشتراكك (حسب الشروط).'
                : 'Chaque ressource acceptée peut ajouter des jours à ton accès (selon les règles en vigueur).'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.uploadBtn} onPress={() => navigation.navigate('UploadResource')} activeOpacity={0.8}>
          <Text style={[styles.uploadBtnText, { writingDirection: textDir(isAr) }]}>
            {isAr ? '📤 ارفع ملفاً' : '📤 Envoyer une ressource'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.refreshBtn} onPress={() => { refetch(); loadCatalog(); }} activeOpacity={0.7}>
          <Text style={[styles.refreshText, { writingDirection: textDir(isAr) }]}>
            {isAr ? '🔄 تحديث' : '🔄 Actualiser'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.7}>
          <Text style={[styles.logoutText, { writingDirection: textDir(isAr) }]}>
            {isAr ? 'تسجيل الخروج' : 'Se déconnecter'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { writingDirection: 'ltr' }]}>
          © 2026 Studara · support@studara.app
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  scroll: { flex: 1 },
  container: { paddingBottom: 40 },

  header: {
    paddingTop: Platform.OS === 'ios' ? 10 : 24,
    paddingBottom: 28,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  headerIcon: { fontSize: 52, marginBottom: 6 },
  headerTitle: { fontSize: 32, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 6 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 14,
  },
  statusText: { fontSize: 13, fontWeight: '700' },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: '#312E81', lineHeight: 20, fontWeight: '600' },

  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
  },
  warnBannerText: { flex: 1, fontSize: 12, color: '#78350F', lineHeight: 18, fontWeight: '600' },

  daysCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    margin: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  daysNumber: { fontSize: 56, fontWeight: '900', color: Colors.primary },
  daysLabel: { fontSize: 16, color: '#374151', fontWeight: '700', marginTop: 4 },
  daysUntil: { fontSize: 12, color: '#6B7280', marginTop: 10, lineHeight: 18, paddingHorizontal: 8 },

  centerPad: { paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center' },
  muted: { fontSize: 14, color: '#6B7280' },
  errorText: { color: '#B91C1C', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  retryBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: '#4F46E5', fontWeight: '700' },

  planTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    paddingVertical: 4,
  },
  planTab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    maxWidth: 160,
    minWidth: 100,
  },
  planTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  planTabText: { fontSize: 11, fontWeight: '600', color: '#6B7280', textAlign: 'center' },
  planTabTextActive: { color: '#111', fontWeight: '800' },

  planCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  planCardHeader: { padding: 20 },
  planCardHeaderRtl: {
    alignItems: 'flex-end',
  },
  planLabelFullWidth: {
    alignSelf: 'stretch',
  },
  planPriceRowRtl: {
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
  },
  planBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  planBadgeRtl: {
    alignSelf: 'flex-end',
  },
  planBadgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  planLabel: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 8 },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  planPrice: { fontSize: 40, fontWeight: '900', color: '#fff' },
  planPer: { fontSize: 16, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  planPerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  planFeatures: { padding: 18, paddingTop: 16 },
  featuresKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  planTagline: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 24,
    marginBottom: 14,
  },
  bulletList: { gap: 12, alignSelf: 'stretch' },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    alignSelf: 'stretch',
  },
  bulletIcon: { marginTop: 2, flexShrink: 0 },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    fontWeight: '500',
  },
  featureLead: { fontSize: 14, color: '#374151', lineHeight: 22, fontWeight: '500' },

  ctaBtn: { marginHorizontal: 16, marginBottom: 16, borderRadius: 14, overflow: 'hidden' },
  ctaBtnGrad: { padding: 16, alignItems: 'center' },
  ctaBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12 },

  bonusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bonusStat: { flex: 1, alignItems: 'center' },
  bonusNum: { fontSize: 28, fontWeight: '900', color: '#7C3AED' },
  bonusLbl: { fontSize: 11, color: '#6B7280', marginTop: 3 },
  bonusDivider: { width: 1, height: 40, backgroundColor: '#E5E7EB', marginHorizontal: 16 },
  bonusInfo: { backgroundColor: '#EDE9FE', borderRadius: 12, padding: 12, marginTop: 12 },
  bonusInfoText: { fontSize: 13, color: '#374151', lineHeight: 20 },

  uploadBtn: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  uploadBtnText: { fontSize: 14, fontWeight: '800', color: Colors.primary },

  refreshBtn: { alignItems: 'center', padding: 10 },
  refreshText: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  logoutBtn: { alignItems: 'center', padding: 8 },
  logoutText: { fontSize: 13, color: '#9CA3AF' },
  footer: { textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 20, paddingHorizontal: 16 },
});
