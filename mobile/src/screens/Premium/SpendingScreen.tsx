/**
 * SpendingScreen — Wallet & Spending History (redesigned)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useWalletNotifications } from '../../hooks/useWalletNotifications';
import { API_BASE } from '../../utils/api';
import { RootStackParamList } from '../../types';
import { safeBack } from '../../utils/safeBack';

type Nav = StackNavigationProp<RootStackParamList>;

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface FeatureTransactions {
  feature: FeatureWallet;
  transactions: Transaction[];
}

// ─── Métadonnées des features ─────────────────────────────────────────────────

const FEATURE_META: Record<string, {
  emoji: string;
  colorPrimary: string;
  colorLight: string;
  categoryFr: string;
  categoryAr: string;
}> = {
  whisper_studio: {
    emoji: '🎙️',
    colorPrimary: '#7C3AED',
    colorLight: '#EDE9FE',
    categoryFr: 'Enregistrements',
    categoryAr: 'التسجيلات',
  },
  ai_flashcards: {
    emoji: '📸',
    colorPrimary: '#059669',
    colorLight: '#D1FAE5',
    categoryFr: 'Flashcards IA',
    categoryAr: 'البطاقات الذكية',
  },
  ai_course: {
    emoji: '🎓',
    colorPrimary: '#DC2626',
    colorLight: '#FEE2E2',
    categoryFr: 'Cours IA',
    categoryAr: 'الدروس الذكية',
  },
};

type TabKey = 'features' | 'all';
type FilterKey = 'all' | 'topup' | 'debit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    else {
      label = d.toLocaleDateString(isAr ? 'ar-MR' : 'fr-FR', { day: 'numeric', month: 'long' });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(tx);
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SpendingScreen() {
  const navigation = useNavigation<Nav>();
  const { token } = useAuth();
  const { colors: C, isDark } = useTheme();
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const { lastUpdate: walletUpdate } = useWalletNotifications();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [featuresData, setFeaturesData] = useState<FeatureTransactions[]>([]);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('features');
  const [filter, setFilter] = useState<FilterKey>('all');

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const walletsRes = await fetch(`${API_BASE}/billing/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const wallets = await walletsRes.json() as FeatureWallet[];

      const featuresWithTransactions: FeatureTransactions[] = await Promise.all(
        wallets.map(async (wallet) => {
          const txRes = await fetch(
            `${API_BASE}/billing/wallet/${wallet.featureKey}/transactions?limit=30`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const txData = await txRes.json();
          const txs: Transaction[] = (txData.transactions || []).map((t: Transaction) => ({
            ...t,
            featureKey: wallet.featureKey,
          }));
          return { feature: wallet, transactions: txs };
        }),
      );

      setFeaturesData(featuresWithTransactions);
    } catch (err) {
      Alert.alert(isAr ? 'خطأ' : 'Erreur', isAr ? 'تعذّر تحميل البيانات' : 'Impossible de charger les données');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (walletUpdate) loadData(); }, [walletUpdate]);
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const totalBalance = featuresData.reduce((s, f) => s + f.feature.balanceMru, 0);
  const totalSpent   = featuresData.reduce((s, f) => s + f.feature.totalSpentMru, 0);
  const totalTopUp   = featuresData.reduce((s, f) => s + f.feature.totalToppedUpMru, 0);

  // ── All transactions merged & sorted ──────────────────────────────────────
  const allTransactions = useMemo(() => {
    const merged = featuresData.flatMap((f) => f.transactions);
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged;
  }, [featuresData]);

  const filteredTransactions = useMemo(() => {
    if (filter === 'all') return allTransactions;
    return allTransactions.filter((tx) => tx.type === filter);
  }, [allTransactions, filter]);

  // ── Formatters ─────────────────────────────────────────────────────────────
  const fmt = (n: number) => n.toLocaleString(isAr ? 'ar-MR' : 'fr-FR', { maximumFractionDigits: 1 });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(isAr ? 'ar-MR' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: C.background }]}>
        <View style={s.simpleHeader}>
          <TouchableOpacity onPress={() => safeBack(navigation)} style={s.backBtn}>
            <AppIcon name="arrowBack" size={24} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.simpleTitle, { color: C.textPrimary }]}>
            {isAr ? 'المحفظة' : 'Mon Wallet'}
          </Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={s.loadingCenter}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={[s.loadingText, { color: C.textMuted }]}>
            {isAr ? 'جاري التحميل…' : 'Chargement…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const spentRatio = totalTopUp > 0 ? Math.min(totalSpent / totalTopUp, 1) : 0;

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: C.background }]}>
      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <LinearGradient colors={['#8B5CF6', '#EC4899', '#F97316']} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {/* Top row */}
        <View style={s.heroTop}>
          <TouchableOpacity onPress={() => safeBack(navigation)} style={s.heroBack}>
            <AppIcon name="arrowBack" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={s.heroBadge}>
            <View style={s.heroBadgeDot} />
            <Text style={s.heroBadgeText}>{isAr ? 'نشط' : 'Actif'}</Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={s.heroRefresh}>
            <AppIcon name='refresh' size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Balance */}
        <Text style={s.heroLabel}>{isAr ? 'الرصيد الإجمالي' : 'Solde total'}</Text>
        <View style={s.heroBalanceRow}>
          <Text style={s.heroBalance}>{fmt(totalBalance)}</Text>
          <Text style={s.heroBalanceCurrency}>{isAr ? ' أوقية' : ' MRU'}</Text>
        </View>

        {/* Spend progress bar */}
        <View style={s.heroProgressWrap}>
          <View style={s.heroProgressBg}>
            <View style={[s.heroProgressFill, { width: `${spentRatio * 100}%` as any }]} />
          </View>
          <Text style={s.heroProgressLabel}>
            {isAr
              ? `${fmt(totalSpent)} مصروف من ${fmt(totalTopUp)} مشحون`
              : `${fmt(totalSpent)} dépensé / ${fmt(totalTopUp)} rechargé`}
          </Text>
        </View>

        {/* Mini stats row */}
        <View style={s.heroStats}>
          <View style={s.heroStatItem}>
            <AppIcon name="arrowUpCircle" size={14} color="#86EFAC" />
            <Text style={s.heroStatValue}>+{fmt(totalTopUp)}</Text>
            <Text style={s.heroStatLabel}>{isAr ? 'شحن' : 'Rechargé'}</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStatItem}>
            <AppIcon name="arrowDownCircle" size={14} color="#FCA5A5" />
            <Text style={s.heroStatValue}>-{fmt(totalSpent)}</Text>
            <Text style={s.heroStatLabel}>{isAr ? 'مصروف' : 'Dépensé'}</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStatItem}>
            <AppIcon name="layersOutline" size={14} color="#C4B5FD" />
            <Text style={s.heroStatValue}>{featuresData.length}</Text>
            <Text style={s.heroStatLabel}>{isAr ? 'ميزات' : 'Features'}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <View style={[s.tabs, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {(['features', 'all'] as TabKey[]).map((tab) => {
          const active = activeTab === tab;
          const label = tab === 'features'
            ? (isAr ? 'حسب الميزة' : 'Par feature')
            : (isAr ? 'كل المعاملات' : 'Toutes');
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, active ? s.tabTextActive : { color: C.textMuted }]}>{label}</Text>
              {tab === 'all' && allTransactions.length > 0 && (
                <View style={[s.tabBadge, active && s.tabBadgeActive]}>
                  <Text style={[s.tabBadgeText, active && { color: '#7C3AED' }]}>
                    {allTransactions.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── TAB: Features ────────────────────────────────────────────── */}
        {activeTab === 'features' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            {featuresData.map((fd) => {
              const meta = FEATURE_META[fd.feature.featureKey];
              if (!meta) return null;
              const f = fd.feature;
              const isExpanded = expandedFeature === f.featureKey;
              const spentPct = f.totalToppedUpMru > 0
                ? Math.min(f.totalSpentMru / f.totalToppedUpMru, 1)
                : 0;
              const isLow = f.totalToppedUpMru > 0 && (f.balanceMru / f.totalToppedUpMru) < 0.2;

              return (
                <View
                  key={f.featureKey}
                  style={[s.featureCard, { backgroundColor: C.surface, borderLeftColor: meta.colorPrimary }]}
                >
                  {/* Card header */}
                  <TouchableOpacity
                    style={s.featureCardHeader}
                    onPress={() => setExpandedFeature(isExpanded ? null : f.featureKey)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.featureIconBox, { backgroundColor: meta.colorLight }]}>
                      <Text style={s.featureEmoji}>{meta.emoji}</Text>
                    </View>

                    <View style={s.featureCardInfo}>
                      <View style={s.featureCardTitleRow}>
                        <Text style={[s.featureCardName, { color: C.textPrimary }]}>
                          {isAr ? f.labelAr : f.labelFr}
                        </Text>
                        {isLow && (
                          <View style={s.lowBadge}>
                            <Text style={s.lowBadgeText}>{isAr ? '⚠️ منخفض' : '⚠️ Faible'}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.featureCardCategory, { color: C.textMuted }]}>
                        {isAr ? meta.categoryAr : meta.categoryFr}
                      </Text>
                    </View>

                    <View style={s.featureCardRight}>
                      <Text style={[s.featureCardBalance, { color: meta.colorPrimary }]}>
                        {fmt(f.balanceMru)}
                      </Text>
                      <Text style={[s.featureCardMru, { color: C.textMuted }]}>MRU</Text>
                      <AppIcon
                        name={isExpanded ? 'chevronUp' : 'chevronDown'}
                        size={16}
                        color={C.textMuted}
                        style={{ marginTop: 2 }}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Progress bar */}
                  <View style={[s.featureProgressBg, { backgroundColor: isDark ? '#2D2D3A' : '#F3F4F6' }]}>
                    <View
                      style={[
                        s.featureProgressFill,
                        { width: `${spentPct * 100}%` as any, backgroundColor: meta.colorPrimary },
                      ]}
                    />
                  </View>

                  {/* Stats row */}
                  <View style={s.featureStatsRow}>
                    <View style={s.featureStat}>
                      <Text style={[s.featureStatVal, { color: '#059669' }]}>+{fmt(f.totalToppedUpMru)}</Text>
                      <Text style={[s.featureStatLbl, { color: C.textMuted }]}>
                        {isAr ? 'مشحون' : 'Rechargé'}
                      </Text>
                    </View>
                    <View style={[s.featureStatDivider, { backgroundColor: C.border }]} />
                    <View style={s.featureStat}>
                      <Text style={[s.featureStatVal, { color: '#DC2626' }]}>-{fmt(f.totalSpentMru)}</Text>
                      <Text style={[s.featureStatLbl, { color: C.textMuted }]}>
                        {isAr ? 'مصروف' : 'Dépensé'}
                      </Text>
                    </View>
                    <View style={[s.featureStatDivider, { backgroundColor: C.border }]} />
                    <View style={s.featureStat}>
                      <Text style={[s.featureStatVal, { color: C.textMuted }]}>{fmt(f.costPerUseMru)}</Text>
                      <Text style={[s.featureStatLbl, { color: C.textMuted }]}>
                        {isAr ? 'أوقية/استخدام' : 'MRU/usage'}
                      </Text>
                    </View>
                  </View>

                  {/* Transactions expanded */}
                  {isExpanded && (
                    <View style={[s.txSection, { borderTopColor: C.border }]}>
                      <Text style={[s.txSectionTitle, { color: C.textPrimary }]}>
                        {isAr ? 'آخر العمليات' : 'Dernières opérations'}
                      </Text>
                      {fd.transactions.length === 0 ? (
                        <Text style={[s.emptyTx, { color: C.textMuted }]}>
                          {isAr ? 'لا توجد عمليات بعد' : 'Aucune opération pour le moment'}
                        </Text>
                      ) : (
                        fd.transactions.map((tx) => (
                          <TxRow key={tx.id} tx={tx} isAr={isAr} C={C} fmt={fmt} fmtTime={fmtTime} />
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {featuresData.length === 0 && (
              <EmptyState isAr={isAr} C={C} />
            )}
          </View>
        )}

        {/* ── TAB: All transactions ─────────────────────────────────────── */}
        {activeTab === 'all' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            {/* Filter pills */}
            <View style={s.filterRow}>
              {(['all', 'topup', 'debit'] as FilterKey[]).map((f) => {
                const active = filter === f;
                const label = f === 'all'
                  ? (isAr ? 'الكل' : 'Tout')
                  : f === 'topup'
                    ? (isAr ? '🟢 شحن' : '🟢 Recharges')
                    : (isAr ? '🔴 مصروف' : '🔴 Dépenses');
                return (
                  <TouchableOpacity
                    key={f}
                    style={[s.filterPill, active && s.filterPillActive, { borderColor: isDark ? '#444' : '#E5E7EB' }]}
                    onPress={() => setFilter(f)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.filterPillText, active && s.filterPillTextActive, { color: active ? '#fff' : C.textMuted }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {filteredTransactions.length === 0 ? (
              <EmptyState isAr={isAr} C={C} />
            ) : (
              groupByDate(filteredTransactions, isAr).map((group) => (
                <View key={group.label} style={s.dateGroup}>
                  <View style={s.dateGroupHeader}>
                    <View style={[s.dateGroupLine, { backgroundColor: C.border }]} />
                    <Text style={[s.dateGroupLabel, { color: C.textMuted, backgroundColor: C.background }]}>
                      {group.label}
                    </Text>
                    <View style={[s.dateGroupLine, { backgroundColor: C.border }]} />
                  </View>
                  {group.items.map((tx) => {
                    const meta = tx.featureKey ? FEATURE_META[tx.featureKey] : null;
                    return (
                      <View key={tx.id} style={[s.allTxCard, { backgroundColor: C.surface }]}>
                        <View style={[s.allTxAccent, { backgroundColor: meta?.colorPrimary ?? '#7C3AED' }]} />
                        <View style={s.allTxLeft}>
                          <Text style={s.allTxEmoji}>{meta?.emoji ?? '💳'}</Text>
                          <View style={s.allTxInfo}>
                            <Text style={[s.allTxDesc, { color: C.textPrimary }]} numberOfLines={1}>
                              {tx.description}
                            </Text>
                            <View style={s.allTxMeta}>
                              <View style={[
                                s.allTxTypePill,
                                { backgroundColor: tx.type === 'topup' ? '#D1FAE5' : tx.type === 'refund' ? '#FEF3C7' : '#FEE2E2' },
                              ]}>
                                <Text style={[
                                  s.allTxTypeText,
                                  { color: tx.type === 'topup' ? '#059669' : tx.type === 'refund' ? '#D97706' : '#DC2626' },
                                ]}>
                                  {tx.type === 'topup'
                                    ? (isAr ? 'شحن' : 'Recharge')
                                    : tx.type === 'refund'
                                      ? (isAr ? 'استرداد' : 'Remb.')
                                      : (isAr ? 'دفع' : 'Dépense')}
                                </Text>
                              </View>
                              <Text style={[s.allTxTime, { color: C.textMuted }]}>
                                {fmtTime(tx.created_at)}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Text style={[
                          s.allTxAmount,
                          { color: tx.type === 'topup' ? '#059669' : tx.type === 'refund' ? '#D97706' : '#DC2626' },
                        ]}>
                          {tx.type === 'topup' || tx.type === 'refund' ? '+' : '-'}{fmt(Math.abs(tx.amount_mru))}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Floating CTA ─────────────────────────────────────────────────── */}
      <View style={s.ctaWrap}>
        <TouchableOpacity
          style={s.ctaBtn}
          onPress={() => navigation.navigate('PremiumRequest' as any)}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#7C3AED', '#EC4899']} style={s.ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <AppIcon name="addCircleOutline" size={22} color="#fff" />
            <Text style={s.ctaBtnText}>{isAr ? 'شحن المحفظة' : 'Recharger le solde'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TxRow({ tx, isAr, C, fmt, fmtTime }: {
  tx: Transaction; isAr: boolean; C: any;
  fmt: (n: number) => string; fmtTime: (s: string) => string;
}) {
  const isTopup = tx.type === 'topup';
  const isRefund = tx.type === 'refund';
  const color = isTopup ? '#059669' : isRefund ? '#D97706' : '#DC2626';
  const bgColor = isTopup ? '#D1FAE5' : isRefund ? '#FEF3C7' : '#FEE2E2';
  const label = isTopup
    ? (isAr ? 'شحن' : 'Recharge')
    : isRefund
      ? (isAr ? 'استرداد' : 'Remb.')
      : (isAr ? 'دفع' : 'Dépense');

  return (
    <View style={[txS.row, { borderBottomColor: C.border }]}>
      <View style={txS.left}>
        <View style={[txS.typePill, { backgroundColor: bgColor }]}>
          <Text style={[txS.typeText, { color }]}>{label}</Text>
        </View>
        <View style={txS.info}>
          <Text style={[txS.desc, { color: C.textPrimary }]} numberOfLines={1}>{tx.description}</Text>
          <Text style={[txS.time, { color: C.textMuted }]}>{fmtTime(tx.created_at)}</Text>
        </View>
      </View>
      <Text style={[txS.amount, { color }]}>
        {isTopup || isRefund ? '+' : '-'}{fmt(Math.abs(tx.amount_mru))} MRU
      </Text>
    </View>
  );
}

function EmptyState({ isAr, C }: { isAr: boolean; C: any }) {
  return (
    <View style={emptyS.wrap}>
      <Text style={emptyS.emoji}>💳</Text>
      <Text style={[emptyS.title, { color: C.textPrimary }]}>
        {isAr ? 'لا توجد بيانات' : 'Aucune donnée'}
      </Text>
      <Text style={[emptyS.sub, { color: C.textMuted }]}>
        {isAr ? 'ستظهر عملياتك هنا بعد استخدام الميزات' : 'Vos opérations apparaîtront ici après utilisation'}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex: { flex: 1 },

  simpleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  simpleTitle: { fontSize: 18, fontWeight: '600' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15 },
  backBtn: { padding: 6 },

  // Hero
  hero: { paddingTop: 8, paddingBottom: 20, paddingHorizontal: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heroBack: { padding: 6 },
  heroRefresh: { padding: 6 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#86EFAC' },
  heroBadgeText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  heroBalanceRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  heroBalance: { fontSize: 42, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  heroBalanceCurrency: { fontSize: 18, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 6, marginLeft: 4 },
  heroProgressWrap: { marginBottom: 20 },
  heroProgressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  heroProgressFill: { height: '100%', backgroundColor: '#86EFAC', borderRadius: 3 },
  heroProgressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroStatValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
  heroStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },

  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#7C3AED' },
  tabText: { fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: '#7C3AED', fontWeight: '700' },
  tabBadge: { backgroundColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: '#EDE9FE' },
  tabBadgeText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  scroll: { flex: 1 },

  // Feature card
  featureCard: { borderRadius: 16, marginBottom: 14, overflow: 'hidden', borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  featureCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  featureIconBox: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  featureEmoji: { fontSize: 22 },
  featureCardInfo: { flex: 1 },
  featureCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  featureCardName: { fontSize: 15, fontWeight: '700' },
  featureCardCategory: { fontSize: 12, marginTop: 2 },
  featureCardRight: { alignItems: 'flex-end' },
  featureCardBalance: { fontSize: 20, fontWeight: '800' },
  featureCardMru: { fontSize: 11 },
  lowBadge: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  lowBadgeText: { fontSize: 10, color: '#92400E', fontWeight: '600' },
  featureProgressBg: { height: 4, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  featureProgressFill: { height: '100%', borderRadius: 2 },
  featureStatsRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingTop: 10, paddingHorizontal: 16 },
  featureStat: { flex: 1, alignItems: 'center' },
  featureStatVal: { fontSize: 13, fontWeight: '700' },
  featureStatLbl: { fontSize: 10, marginTop: 1 },
  featureStatDivider: { width: 1, height: 24 },
  txSection: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  txSectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  emptyTx: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },

  // Filter pills
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterPillActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  filterPillText: { fontSize: 13, fontWeight: '500' },
  filterPillTextActive: { fontWeight: '700' },

  // Date group
  dateGroup: { marginBottom: 8 },
  dateGroupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dateGroupLine: { flex: 1, height: 1 },
  dateGroupLabel: { fontSize: 11, fontWeight: '600', paddingHorizontal: 10, letterSpacing: 0.5, textTransform: 'uppercase' },

  // All-tx card
  allTxCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  allTxAccent: { width: 4, alignSelf: 'stretch' },
  allTxLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  allTxEmoji: { fontSize: 22 },
  allTxInfo: { flex: 1 },
  allTxDesc: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  allTxMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allTxTypePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  allTxTypeText: { fontSize: 10, fontWeight: '700' },
  allTxTime: { fontSize: 11 },
  allTxAmount: { fontSize: 15, fontWeight: '800', paddingRight: 14 },

  // CTA
  ctaWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 },
  ctaBtn: { borderRadius: 16, overflow: 'hidden', shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  ctaGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

const txS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 },
  typePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 11, fontWeight: '700' },
  info: { flex: 1 },
  desc: { fontSize: 13, fontWeight: '500' },
  time: { fontSize: 11, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '800' },
});

const emptyS = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
