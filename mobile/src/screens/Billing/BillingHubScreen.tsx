/**
 * BillingHubScreen — single hub for:
 * - Studara+ subscriptions (catalog plan + counters)
 * - PAYG universal wallet (balance + pricing + topup request + spending history)
 *
 * Refreshes every 25s (and on pull-to-refresh).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Platform,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { apiRequest, API_BASE } from '../../utils/api';
import { Colors, BorderRadius, Spacing, Shadows, Gradients } from '../../theme';
import { safeBack } from '../../utils/safeBack';
import { PAYG_FEATURES, getPaygFeature, PaygModelPrice } from '../../constants/paygFeatures';

type TabKey = 'overview' | 'wallet';
const isRtl = I18nManager.isRTL;

// ── Subscription / usage types (catalog module) ────────────────────────────────
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

// ── Legacy PAYG wallet types ──────────────────────────────────────────────────
interface FeatureWallet {
  featureKey: string;
  labelAr: string;
  labelFr: string;
  balanceMru: number;
  totalToppedUpMru: number;
  totalSpentMru: number;
  costPerUseMru: number;
}

interface Transaction {
  id: string;
  amount_mru: number;
  type: 'topup' | 'debit' | 'refund';
  description: string;
  created_at: string;
  featureKey?: string;
}

// ── Banks (same as PremiumRequest) ────────────────────────────────────────────
interface Bank {
  id: number;
  name_ar: string;
  name_fr: string;
  app_name: string;
}

const FALLBACK_BANKS: Bank[] = [
  { id: 1, name_ar: 'بنكيلي', name_fr: 'Bankily', app_name: 'Bankily' },
  { id: 2, name_ar: 'مصريفي', name_fr: 'Masrivy', app_name: 'Masrivy' },
  { id: 3, name_ar: 'سداد', name_fr: 'Sedad', app_name: 'Sedad' },
];

const PAYMENT_ACCOUNTS = [
  { bank: 'Bankily', phone: '42986738', color: '#16A34A' },
  { bank: 'Masrivy', phone: '36863516', color: '#7C3AED' },
  { bank: 'Sedad', phone: '32164356', color: '#2563EB' },
] as const;

const PAYMENT_PHONE_BY_APP: Record<string, string> = Object.fromEntries(
  PAYMENT_ACCOUNTS.map((a) => [a.bank, a.phone] as const),
);

const ALLOWED_BANK_APP_NAMES = new Set(['Bankily', 'Sedad', 'Masrivy']);
const BANK_ORDER = ['Bankily', 'Masrivy', 'Sedad'] as const;

function normalizeBanks(input: Bank[]): Bank[] {
  const byApp = new Map<string, Bank>();
  for (const b of input) {
    if (!ALLOWED_BANK_APP_NAMES.has(b.app_name)) continue;
    if (!byApp.has(b.app_name)) byApp.set(b.app_name, b);
  }
  const fallbackByApp = new Map(FALLBACK_BANKS.map((b) => [b.app_name, b] as const));
  return BANK_ORDER.map((app) => byApp.get(app) ?? fallbackByApp.get(app)!).filter(Boolean);
}

function groupByDate(transactions: Transaction[], isAr: boolean): { label: string; items: Transaction[] }[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();
  const groups: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    const d = new Date(tx.created_at);
    const ds = d.toDateString();
    let label: string;
    if (ds === todayStr) label = isAr ? 'اليوم' : "Aujourd'hui";
    else if (ds === yesterdayStr) label = isAr ? 'أمس' : 'Hier';
    else label = d.toLocaleDateString(isAr ? 'ar-MR' : 'fr-FR', { day: 'numeric', month: 'long' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(tx);
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

function priceUnitLabel(unit: PaygModelPrice['unit'], isAr: boolean): string {
  if (unit === 'per_minute') return isAr ? 'لكل دقيقة' : '/ minute';
  if (unit === 'per_page') return isAr ? 'لكل صفحة' : '/ page';
  if (unit === 'per_1k_words') return isAr ? 'لكل 1000 كلمة' : '/ 1000 mots';
  return isAr ? 'لكل استخدام' : '/ utilisation';
}

function formatMru(n: number): string {
  // Keep enough precision for small MRU prices (e.g. 0.054 MRU/min).
  if (Number.isInteger(n)) return String(n);
  if (n < 0.1) return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export default function BillingHubScreen() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const { lang, isAr } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const { refetch: refetchGlobalSub } = useSubscription();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Subscription (catalog) snapshot + counters
  const [sub, setSub] = useState<SubscriptionSnap | null>(null);
  const [counters, setCounters] = useState<CounterRow[]>([]);
  const [subError, setSubError] = useState<string | null>(null);

  // Wallet data (legacy per-feature endpoint, aggregated as universal wallet)
  const [wallets, setWallets] = useState<FeatureWallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [featureActiveByKey, setFeatureActiveByKey] = useState<Record<string, boolean>>({});

  // Topup request (universal)
  const [banks, setBanks] = useState<Bank[]>(FALLBACK_BANKS);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const DEFAULT_TOPUP_MRU = 100;
  const [topupAmount, setTopupAmount] = useState(String(DEFAULT_TOPUP_MRU));
  const [screenshot, setScreenshot] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [submittingTopup, setSubmittingTopup] = useState(false);

  const universalWallet = useMemo(
    () => wallets.find((w) => w.featureKey === 'wallet_universal') ?? null,
    [wallets],
  );

  const relevantWallets = useMemo(() => {
    const keys = new Set(PAYG_FEATURES.map((f) => f.key));
    return wallets.filter((w) => keys.has(w.featureKey as any));
  }, [wallets]);

  const totalBalance = useMemo(
    () => (universalWallet ? universalWallet.balanceMru ?? 0 : relevantWallets.reduce((s, w) => s + (w.balanceMru ?? 0), 0)),
    [relevantWallets, universalWallet],
  );
  const totalSpent = useMemo(
    () =>
      universalWallet
        ? universalWallet.totalSpentMru ?? 0
        : relevantWallets.reduce((s, w) => s + (w.totalSpentMru ?? 0), 0),
    [relevantWallets, universalWallet],
  );
  const totalTopUp = useMemo(
    () =>
      universalWallet
        ? universalWallet.totalToppedUpMru ?? 0
        : relevantWallets.reduce((s, w) => s + (w.totalToppedUpMru ?? 0), 0),
    [relevantWallets, universalWallet],
  );

  const parsedAmount = parseInt(topupAmount || '0', 10) || 0;
  const effectiveAmount = parsedAmount > 0 ? parsedAmount : DEFAULT_TOPUP_MRU;
  const amountValid = effectiveAmount >= 50;

  const loadAll = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    if (!silent) setSubError(null);
    if (!silent) setWalletError(null);

    try {
      refetchGlobalSub();
    } catch {
      // ignore
    }

    // ── Subscription & counters ────────────────────────────────────────────
    try {
      const nextSub = await apiRequest<SubscriptionSnap>('/me/subscription', { token });
      setSub(nextSub);
    } catch (e: any) {
      setSub(null);
      setSubError(isAr ? 'تعذّر تحميل الاشتراك.' : "Impossible de charger l'abonnement.");
    }

    try {
      const u = await apiRequest<{ counters: CounterRow[] }>('/me/usage', { token });
      setCounters(Array.isArray(u?.counters) ? u.counters : []);
    } catch {
      setCounters([]);
    }

    // ── PAYG wallets + transactions ───────────────────────────────────────
    try {
      const walletsRes = await fetch(`${API_BASE}/billing/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ws = (await walletsRes.json()) as FeatureWallet[];
      setWallets(Array.isArray(ws) ? ws : []);

      const hasUniversal = Array.isArray(ws) && ws.some((w) => w.featureKey === 'wallet_universal');
      if (hasUniversal) {
        const txRes = await fetch(`${API_BASE}/billing/wallet/wallet_universal/transactions?limit=60`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const txData = await txRes.json();
        const items: Transaction[] = (txData.transactions || []).map((t: Transaction) => ({
          ...t,
          featureKey: 'wallet_universal',
        }));
        setTransactions(items);
      } else {
        // Merge per-feature transactions into one stream for the hub.
        const txs: Transaction[] = [];
        const keys = new Set(PAYG_FEATURES.map((f) => f.key));
        await Promise.all(
          (Array.isArray(ws) ? ws : []).map(async (w) => {
            if (!keys.has(w.featureKey as any)) return;
            const txRes = await fetch(
              `${API_BASE}/billing/wallet/${w.featureKey}/transactions?limit=40`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            const txData = await txRes.json();
            const items: Transaction[] = (txData.transactions || []).map((t: Transaction) => ({
              ...t,
              featureKey: w.featureKey,
            }));
            txs.push(...items);
          }),
        );
        txs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setTransactions(txs);
      }
    } catch (e: any) {
      setWallets([]);
      setTransactions([]);
      setWalletError(isAr ? 'تعذّر تحميل المحفظة.' : 'Impossible de charger le wallet.');
    }

    // ── Feature availability (admin-controlled) ───────────────────────────
    try {
      const featsRes = await fetch(`${API_BASE}/billing/features`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (featsRes.ok) {
        const feats = (await featsRes.json()) as any[];
        const map: Record<string, boolean> = {};
        for (const f of Array.isArray(feats) ? feats : []) {
          map[String(f.key)] = !!f.is_active;
        }
        setFeatureActiveByKey(map);
      }
    } catch {
      // ignore
    }

    // ── Banks list (best-effort) ───────────────────────────────────────────
    try {
      const bankRes = await fetch(`${API_BASE}/billing/banks`, { headers: { Authorization: `Bearer ${token}` } });
      if (bankRes.ok) {
        const bData = (await bankRes.json()) as Bank[];
        if (Array.isArray(bData) && bData.length) setBanks(normalizeBanks(bData));
      }
    } catch {
      // ignore
    }

    if (!silent) setLoading(false);
    setRefreshing(false);
  }, [token, isAr, refetchGlobalSub]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => loadAll(true), 25_000);
    return () => clearInterval(id);
  }, [token, loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const fmt = (n: number) => n.toLocaleString(isAr ? 'ar-MR' : 'fr-FR', { maximumFractionDigits: 1 });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(isAr ? 'ar-MR' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });

  const pickScreenshot = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(isAr ? 'الأذونات مطلوبة' : 'Permissions requises', isAr ? 'يرجى السماح بالوصول إلى الصور' : 'Autorisation galerie nécessaire');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      setScreenshot({ uri: asset.uri, name: `screenshot.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    }
  }, [isAr]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(isAr ? 'الكاميرا مطلوبة' : 'Caméra requise', isAr ? 'يرجى السماح بالوصول إلى الكاميرا' : 'Autorisation caméra nécessaire');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets.length > 0) {
      setScreenshot({ uri: result.assets[0].uri, name: 'screenshot.jpg', type: 'image/jpeg' });
    }
  }, [isAr]);

  const submitTopup = useCallback(async () => {
    if (!token || !selectedBank || !screenshot || !amountValid) {
      Alert.alert(isAr ? 'معلومات ناقصة' : 'Infos manquantes', isAr ? 'اختر البنك والمبلغ وأرفق الإيصال' : 'Choisis la banque, le montant, et ajoute le reçu.');
      return;
    }
    setSubmittingTopup(true);
    try {
      const form = new FormData();
      // Universal wallet: backend must accept a special key or ignore it.
      // If the backend is still legacy "wallet per feature", it can reject — the error will surface.
      form.append('feature_key', 'wallet_universal');
      form.append('bank_name', selectedBank.name_ar);
      form.append('topup_amount', String(effectiveAmount));
      form.append('screenshot', {
        uri: Platform.OS === 'ios' ? screenshot.uri.replace('file://', '') : screenshot.uri,
        name: screenshot.name,
        type: screenshot.type,
      } as any);

      const res = await fetch(`${API_BASE}/billing/feature-request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert(isAr ? 'خطأ' : 'Erreur', data?.error ?? (isAr ? 'فشل إرسال الطلب' : "Échec d'envoi"));
        return;
      }
      Alert.alert(isAr ? '✅ تم' : '✅ OK', isAr ? 'تم إرسال طلب الشحن. سيتم التفعيل بعد المراجعة.' : 'Demande envoyée. Activation après validation.');
      setTopupAmount(String(DEFAULT_TOPUP_MRU));
      setScreenshot(null);
      setSelectedBank(null);
      loadAll(true);
    } catch (e: any) {
      Alert.alert(isAr ? 'خطأ في الاتصال' : 'Erreur réseau', e.message ?? (isAr ? 'تحقق من الإنترنت' : 'Vérifie ta connexion'));
    } finally {
      setSubmittingTopup(false);
    }
  }, [token, selectedBank, screenshot, amountValid, effectiveAmount, isAr, loadAll]);

  const labelForCounter = useCallback((key: string) => {
    const fr: Record<string, string> = {
      ai_messages: 'Questions IA (fenêtre)',
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
  }, [isAr]);

  const spentRatio = totalTopUp > 0 ? Math.min(totalSpent / totalTopUp, 1) : 0;

  if (loading) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: C.background }]}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[s.muted, { marginTop: 12, color: C.textMuted }]}>
            {isAr ? 'جاري التحميل…' : 'Chargement…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: C.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => safeBack(navigation)} style={[s.backBtn, { backgroundColor: C.surfaceVariant }]} hitSlop={12}>
          <AppIcon name={isAr ? 'chevronForward' : 'chevronBack'} size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.textPrimary }]}>
          {isAr ? 'الدفع والاشتراكات' : 'Paiement & abonnements'}
        </Text>
        <TouchableOpacity onPress={onRefresh} style={s.refreshBtn} hitSlop={10}>
          <AppIcon name="refresh" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {(['overview', 'wallet'] as TabKey[]).map((tab) => {
          const active = activeTab === tab;
          const label = tab === 'overview'
            ? (isAr ? 'نظرة عامة' : 'Vue d’ensemble')
            : (isAr ? 'المحفظة' : 'Wallet');
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.75}
            >
              <Text style={[s.tabText, { color: active ? Colors.primary : C.textMuted }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Overview */}
        {activeTab === 'overview' && (
          <View style={{ padding: Spacing.lg }}>
            <Text style={[s.sectionKicker, { color: C.textSecondary }]}>
              {isAr ? 'Studara+ (اشتراك)' : 'Studara+ (abonnement)'}
            </Text>
            <View style={[s.panel, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}>
              {subError ? (
                <Text style={[s.errorText, { color: isDark ? '#fecaca' : '#991B1B' }]}>{subError}</Text>
              ) : sub?.isStaffBypass ? (
                <Text style={[s.planName, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                  {isAr ? 'حساب فريق' : 'Compte équipe'}
                </Text>
              ) : sub?.planNameFr ? (
                <>
                  <Text style={[s.planName, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                    {sub.planNameFr}
                  </Text>
                  <Text style={[s.muted, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left' }]}>
                    {sub.planCode ? `${sub.planCode} · ` : ''}{sub.status}
                  </Text>
                  {sub.currentPeriodEndAt ? (
                    <Text style={[s.muted, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left' }]}>
                      {isAr ? 'نهاية الفترة: ' : 'Fin de période : '}
                      {new Date(sub.currentPeriodEndAt).toLocaleDateString(isAr ? 'ar' : 'fr-FR')}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={[s.blockKicker, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left', marginBottom: 6 }]}>
                    {isAr ? 'لا يوجد اشتراك Studara+ نشط' : 'Aucun abonnement Studara+ actif'}
                  </Text>
                  <Text style={[s.cardBody, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                    {isAr
                      ? 'يمكنك الاشتراك لفتح Assistant AI (بالاشتراك).'
                      : "Tu peux t’abonner pour débloquer Assistant AI (abonnement)."}
                  </Text>
                  <View style={[s.panelDivider, { backgroundColor: C.border }]} />
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => (navigation as any).navigate('Paywall')}
                    style={s.panelCtaInner}
                  >
                    <LinearGradient
                      colors={Gradients.brand as any}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[s.panelCtaGrad, isAr ? { flexDirection: 'row-reverse' } : { flexDirection: 'row' }]}
                    >
                      <AppIcon name="sparkles" size={20} color="#fff" />
                      <Text style={s.panelCtaText}>{isAr ? 'اكتشف Studara+' : 'Découvrir Studara+'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <Text style={[s.sectionKicker, { color: C.textSecondary, marginTop: Spacing.lg }]}>
              {isAr ? 'الحدود (الاشتراك)' : 'Quotas (abonnement)'}
            </Text>
            <View style={[s.panel, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}>
              {counters.length === 0 ? (
                <Text style={[s.muted, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left', lineHeight: 22 }]}>
                  {isAr ? 'لا توجد أرقام نشطة حالياً.' : "Aucun compteur actif pour le moment."}
                </Text>
              ) : (
                counters.map((c) => (
                  <View
                    key={c.counterKey}
                    style={[
                      s.row,
                      { borderBottomColor: isDark ? '#27272a' : '#E5E7EB' },
                      isAr ? { flexDirection: 'row-reverse' } : { flexDirection: 'row' },
                    ]}
                  >
                    <Text style={[s.rowLabel, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                      {labelForCounter(c.counterKey)}
                    </Text>
                    <Text style={[s.rowVal, { color: Colors.primary }]}>
                      {c.remainingTotal} / {c.limitTotal || '—'}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <Text style={[s.sectionKicker, { color: C.textSecondary, marginTop: Spacing.lg }]}>
              {isAr ? 'PAYG (محفظة واحدة)' : 'PAYG (wallet unique)'}
            </Text>
            <LinearGradient colors={['#8B5CF6', '#EC4899', '#F97316']} style={s.walletHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={s.walletHeroTop}>
                <Text style={s.walletHeroLabel}>{isAr ? 'الرصيد الإجمالي' : 'Solde total'}</Text>
                <Text style={s.walletHeroHint}>{isAr ? 'يُستخدم على كل ميزات PAYG' : 'Utilisable sur toutes les features PAYG'}</Text>
              </View>
              <View style={s.walletHeroBalanceRow}>
                <Text style={s.walletHeroBalance}>{fmt(totalBalance)}</Text>
                <Text style={s.walletHeroCurrency}>{isAr ? ' أوقية' : ' MRU'}</Text>
              </View>
              <View style={s.walletHeroProgressBg}>
                <View style={[s.walletHeroProgressFill, { width: `${spentRatio * 100}%` as any }]} />
              </View>
              <Text style={s.walletHeroProgressLabel}>
                {isAr
                  ? `${fmt(totalSpent)} مصروف / ${fmt(totalTopUp)} مشحون`
                  : `${fmt(totalSpent)} dépensé / ${fmt(totalTopUp)} rechargé`}
              </Text>
              {walletError ? (
                <Text style={[s.walletHeroWarning, { marginTop: 10 }]}>{walletError}</Text>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setActiveTab('wallet')}
                style={s.walletHeroCta}
              >
                <Text style={s.walletHeroCtaText}>{isAr ? 'إدارة المحفظة' : 'Gérer le wallet'}</Text>
                <AppIcon name={isRtl ? 'chevronBack' : 'chevronForward'} size={16} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        {/* Wallet */}
        {activeTab === 'wallet' && (
          <View style={{ padding: Spacing.lg }}>
            <LinearGradient colors={['#7C3AED', '#EC4899']} style={s.paygHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={s.paygHeaderTitle}>{isAr ? '💳 المحفظة (PAYG)' : '💳 Wallet (PAYG)'}</Text>
                <View style={s.paygHeaderPill}>
                  <AppIcon name="wallet" size={16} color="#fff" />
                  <Text style={s.paygHeaderPillText}>{fmt(totalBalance)} {isAr ? 'أوقية' : 'MRU'}</Text>
                </View>
              </View>
              <Text style={s.paygHeaderSub}>
                {isAr ? 'رصيد واحد لكل الميزات — كل ميزة بسعرها.' : 'Un seul solde pour toutes les features — chaque feature a son prix.'}
              </Text>
            </LinearGradient>

            {/* Pricing list */}
            <Text style={[s.sectionKicker, { color: C.textSecondary, marginTop: Spacing.lg }]}>
              {isAr ? 'الميزات والأسعار' : 'Fonctionnalités & prix'}
            </Text>
            <View style={[s.panel, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}>
              {PAYG_FEATURES.map((f) => {
                const meta = getPaygFeature(f.key);
                const pricing = meta?.pricing ?? [];
                const active = featureActiveByKey[f.key] ?? true;
                const isSoon = f.status === 'soon' || !active;
                return (
                  <View
                    key={f.key}
                    style={[
                      s.featureRow,
                      { borderBottomColor: isDark ? '#27272a' : '#E5E7EB' },
                      isAr ? { flexDirection: 'row-reverse' } : { flexDirection: 'row' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.featureTitle, { color: C.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                        {isAr ? f.labelAr : f.labelFr} {isSoon ? (isAr ? ' (قريباً)' : ' (bientôt)') : ''}
                      </Text>
                      <Text style={[s.featureDesc, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left' }]}>
                        {isAr ? f.descriptionAr : f.descriptionFr}
                      </Text>
                      {!!meta?.usageDefinitionFr && (
                        <Text style={[s.featureDesc, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left', marginTop: 4, fontWeight: '800' }]}>
                          {isAr ? meta.usageDefinitionAr : meta.usageDefinitionFr}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', minWidth: 120 }}>
                      {pricing.length ? (
                        <View style={{ gap: 4, alignItems: 'flex-end' }}>
                          {pricing.map((p) => {
                            const unitLbl = priceUnitLabel(p.unit, isAr);
                            const modelLbl = isAr ? p.labelAr : p.labelFr;
                            const price = p.priceMru;
                            const missing = price == null;
                            return (
                              <Text
                                key={p.modelKey}
                                style={[s.featurePrice, { color: missing ? '#F59E0B' : Colors.primary }]}
                              >
                                {modelLbl}:{' '}
                                {missing
                                  ? isAr
                                    ? '— (سعر لاحقاً)'
                                    : '— (prix à remplir)'
                                  : `${formatMru(price)} ${isAr ? 'أوقية' : 'MRU'} ${unitLbl}`}
                              </Text>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={[s.featurePrice, { color: '#F59E0B' }]}>
                          {isAr ? '— (سعر لاحقاً)' : '— (prix à remplir)'}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Topup form */}
            <Text style={[s.sectionKicker, { color: C.textSecondary, marginTop: Spacing.lg }]}>
              {isAr ? 'شحن المحفظة' : 'Recharger le wallet'}
            </Text>
            <View style={[s.panel, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}>
              <Text style={[s.muted, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left', lineHeight: 20 }]}>
                {isAr
                  ? 'ادفع عبر Bankily / Sedad / Masrivy ثم أرفق لقطة شاشة. سيتم تفعيل الرصيد بعد المراجعة.'
                  : 'Payez via Bankily / Sedad / Masrivy puis joignez le reçu. Le solde sera activé après validation.'}
              </Text>

              <View style={{ height: 10 }} />
              <Text style={[s.inputLabel, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left' }]}>
                {isAr ? 'المبلغ (الحد الأدنى 50)' : 'Montant (min 50)'}
              </Text>
              <View style={s.amountRow}>
                <TextInput
                  style={[s.amountInput, { backgroundColor: isDark ? '#111827' : '#F9FAFB', color: C.textPrimary, borderColor: Colors.primary }]}
                  value={topupAmount}
                  onChangeText={(v) => setTopupAmount(v.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  placeholder="100"
                  placeholderTextColor={C.textSecondary}
                  textAlign={isAr ? 'right' : 'left'}
                />
                <Text style={[s.amountUnit, { color: C.textSecondary }]}>{isAr ? 'أوقية' : 'MRU'}</Text>
              </View>

              <Text style={[s.inputLabel, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left', marginTop: 12 }]}>
                {isAr ? 'اختر التطبيق البنكي' : 'Choisir la banque'}
              </Text>
              <View style={{ gap: 10 }}>
                {banks.map((b) => {
                  const selected = selectedBank?.id === b.id;
                  const phone = PAYMENT_PHONE_BY_APP[b.app_name] ?? '';
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        s.bankItem,
                        { backgroundColor: C.surface, borderColor: selected ? '#2563EB' : C.border },
                        selected && { backgroundColor: isDark ? '#0b1220' : '#EFF6FF' },
                      ]}
                      onPress={() => setSelectedBank(b)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.bankIcon, selected && { backgroundColor: isDark ? '#111827' : '#DBEAFE' }]}>
                        <AppIcon name="wallet" size={18} color={selected ? '#1D4ED8' : C.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: C.textPrimary }}>{isAr ? b.name_ar : b.name_fr}</Text>
                        <Text style={{ fontSize: 11, color: C.textSecondary }}>
                          {b.app_name}{phone ? ` · ${phone}` : ''}
                        </Text>
                      </View>
                      {selected ? <AppIcon name="checkmarkCircle" size={18} color="#2563EB" /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.inputLabel, { color: C.textSecondary, textAlign: isAr ? 'right' : 'left', marginTop: 12 }]}>
                {isAr ? 'إرفاق الإيصال' : 'Ajouter le reçu'}
              </Text>
              {screenshot ? (
                <View style={s.screenshotWrap}>
                  <Image source={{ uri: screenshot.uri }} style={s.screenshotImg} />
                  <TouchableOpacity style={s.screenshotRemove} onPress={() => setScreenshot(null)} activeOpacity={0.8}>
                    <Text style={s.screenshotRemoveText}>{isAr ? 'حذف' : 'Retirer'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[s.uploader, { borderColor: C.border }]}>
                  <Text style={{ fontSize: 36, marginBottom: 6 }}>📸</Text>
                  <Text style={{ color: C.textPrimary, fontWeight: '700' }}>
                    {isAr ? 'أضف لقطة شاشة واضحة' : 'Ajoute une capture claire'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity style={[s.uploaderBtn, { backgroundColor: isDark ? '#111827' : '#F3F4F6' }]} onPress={pickScreenshot}>
                      <Text style={{ fontWeight: '700', color: C.textPrimary }}>{isAr ? 'من المعرض' : 'Galerie'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.uploaderBtn, { backgroundColor: isDark ? '#111827' : '#F3F4F6' }]} onPress={takePhoto}>
                      <Text style={{ fontWeight: '700', color: C.textPrimary }}>{isAr ? 'الكاميرا' : 'Caméra'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[
                  s.submitBtn,
                  (!selectedBank || !screenshot || !amountValid || submittingTopup) && { opacity: 0.6 },
                ]}
                disabled={!selectedBank || !screenshot || !amountValid || submittingTopup}
                onPress={submitTopup}
                activeOpacity={0.85}
              >
                {submittingTopup ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.submitBtnText}>
                    {isAr
                      ? `📤 إرسال طلب شحن ${effectiveAmount}`
                      : `📤 Envoyer une demande (${effectiveAmount} MRU)`}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={[s.footnote, { color: C.textSecondary, textAlign: 'center' }]}>
                {isAr
                  ? 'ملاحظة: إذا رفض الخادم "wallet_universal"، نحتاج تحديث الـ API لإتاحة محفظة موحّدة.'
                  : 'Note: si le serveur refuse "wallet_universal", il faudra mettre à jour l’API pour supporter le wallet universel.'}
              </Text>
            </View>

            {/* History */}
            <Text style={[s.sectionKicker, { color: C.textSecondary, marginTop: Spacing.lg }]}>
              {isAr ? 'سجل العمليات' : 'Historique'}
            </Text>
            <View style={[s.panel, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}>
              {transactions.length === 0 ? (
                <Text style={[s.muted, { color: C.textSecondary, textAlign: 'center' }]}>
                  {isAr ? 'لا توجد عمليات بعد' : 'Aucune opération pour le moment'}
                </Text>
              ) : (
                groupByDate(transactions, isAr).map((g) => (
                  <View key={g.label} style={{ marginBottom: 10 }}>
                    <View style={s.dateHeader}>
                      <View style={[s.dateLine, { backgroundColor: C.border }]} />
                      <Text style={[s.dateLabel, { color: C.textSecondary, backgroundColor: C.surface }]}>{g.label}</Text>
                      <View style={[s.dateLine, { backgroundColor: C.border }]} />
                    </View>
                    {g.items.map((tx) => {
                      const color = tx.type === 'topup' ? '#059669' : tx.type === 'refund' ? '#D97706' : '#DC2626';
                      const sign = tx.type === 'topup' || tx.type === 'refund' ? '+' : '-';
                      const f = tx.featureKey ? getPaygFeature(tx.featureKey) : undefined;
                      return (
                        <View key={tx.id} style={[s.txRow, { borderBottomColor: C.border }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: C.textPrimary, fontWeight: '700' }} numberOfLines={1}>
                              {tx.description}
                            </Text>
                            <Text style={{ color: C.textSecondary, fontSize: 11 }}>
                              {fmtTime(tx.created_at)}{f ? (isAr ? ` · ${f.labelAr}` : ` · ${f.labelFr}`) : ''}
                            </Text>
                          </View>
                          <Text style={{ color, fontWeight: '900' }}>
                            {sign}{fmt(Math.abs(tx.amount_mru))} {isAr ? 'أوقية' : 'MRU'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontSize: 14, fontWeight: '500' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  refreshBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '800' },

  sectionKicker: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  panel: {
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    padding: Spacing.lg,
  },
  panelDivider: { height: 1, marginVertical: Spacing.md },
  panelCtaInner: { borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadows.brand },
  panelCtaGrad: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: Spacing.lg },
  panelCtaText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },

  errorText: { fontSize: 13, fontWeight: '700' },
  planName: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  blockKicker: { fontSize: 12, fontWeight: '900' },
  cardBody: { fontSize: 14, lineHeight: 22, fontWeight: '500' },

  row: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1 },
  rowLabel: { flex: 1, fontSize: 14, paddingHorizontal: 4, fontWeight: '700' },
  rowVal: { fontSize: 15, fontWeight: '900', minWidth: 80, textAlign: 'center' },

  walletHero: { borderRadius: 22, padding: 18, overflow: 'hidden' },
  walletHeroTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  walletHeroLabel: { color: 'rgba(255,255,255,0.92)', fontWeight: '800' },
  walletHeroHint: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700' },
  walletHeroBalanceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 },
  walletHeroBalance: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  walletHeroCurrency: { fontSize: 16, fontWeight: '800', color: 'rgba(255,255,255,0.8)', marginBottom: 6, marginLeft: 6 },
  walletHeroProgressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  walletHeroProgressFill: { height: '100%', backgroundColor: '#86EFAC', borderRadius: 3 },
  walletHeroProgressLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 8, fontWeight: '700' },
  walletHeroWarning: { color: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: '800' },
  walletHeroCta: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletHeroCtaText: { color: '#fff', fontWeight: '900' },

  paygHeader: { borderRadius: 22, padding: 16 },
  paygHeaderTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  paygHeaderSub: { color: 'rgba(255,255,255,0.82)', marginTop: 8, fontWeight: '700', lineHeight: 18 },
  paygHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  paygHeaderPillText: { color: '#fff', fontWeight: '900' },

  featureRow: { paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  featureTitle: { fontWeight: '900', fontSize: 14 },
  featureDesc: { fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 18 },
  featurePrice: { fontWeight: '900', fontSize: 12 },

  inputLabel: { fontSize: 12, fontWeight: '900', marginBottom: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountInput: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 20, fontWeight: '900' },
  amountUnit: { fontWeight: '800' },

  bankItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  bankIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  uploader: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 6 },
  uploaderBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  screenshotWrap: { position: 'relative', marginTop: 6 },
  screenshotImg: { width: '100%', height: 200, borderRadius: 14, resizeMode: 'cover' },
  screenshotRemove: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  screenshotRemoveText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  submitBtn: { marginTop: 14, backgroundColor: '#6D28D9', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '900' },
  footnote: { marginTop: 10, fontSize: 11, fontWeight: '600', lineHeight: 16 },

  dateHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 8 },
  dateLine: { flex: 1, height: 1 },
  dateLabel: { fontSize: 11, fontWeight: '900', paddingHorizontal: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  txRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
});

