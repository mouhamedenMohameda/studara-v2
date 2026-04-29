/**
 * PremiumRequestScreen - Pay-as-you-go (PAYG) edition
 *
 * Flow:
 *  1. User sees all features with current wallet balance + consumption bar
 *  2. Selects a feature -> enters desired recharge amount (>= 50 MRU)
 *  3. Pays via Bankily (42986738) or Sedad (32164356)
 *  4. Takes a screenshot -> submits
 *  5. Admin approves -> wallet credited instantly
 */

import React, { useState, useCallback, useEffect } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Platform, I18nManager, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { RootStackParamList } from '../../types';
import { Colors } from '../../theme';
import { API_BASE } from '../../utils/api';
import { safeBack } from '../../utils/safeBack';

type Nav   = StackNavigationProp<RootStackParamList, 'PremiumRequest'>;
type Route = RouteProp<RootStackParamList, 'PremiumRequest'>;

const isRtl = I18nManager.isRTL;

// ── Payment accounts (Bankily + Sedad + Masrivy) ─────────────────────────────
const PAYMENT_ACCOUNTS = [
  { bank: 'Bankily', phone: '42986738', color: '#16A34A' },
  { bank: 'Sedad',   phone: '32164356', color: '#2563EB' },
  { bank: 'Masrivy', phone: '36863516', color: '#7C3AED' },
] as const;

const FALLBACK_BANKS = [
  { id: 1, name_ar: 'بنكيلي', name_fr: 'Bankily', app_name: 'Bankily' },
  { id: 2, name_ar: 'مصريفي', name_fr: 'Masrivy', app_name: 'Masrivy' },
  { id: 3, name_ar: 'سداد',  name_fr: 'Sedad',   app_name: 'Sedad'   },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface PremiumFeature {
  key:              string;
  label_ar:         string;
  label_fr:         string;
  description_ar:   string;
  description_fr:   string;
  cost_per_use_mru: number;
  min_recharge_mru: number;
  hasAccess:        boolean;
  balanceMru:       number;
  totalToppedUpMru: number;
  totalSpentMru:    number;
}

interface Bank {
  id:       number;
  name_ar:  string;
  name_fr:  string;
  app_name: string;
}

const ALLOWED_BANK_APP_NAMES = new Set(['Bankily', 'Sedad', 'Masrivy']);
const BANK_ORDER = ['Bankily', 'Masrivy', 'Sedad'] as const;

function normalizeBanks(input: Bank[]): Bank[] {
  const byApp = new Map<string, Bank>();
  for (const b of input) {
    if (!ALLOWED_BANK_APP_NAMES.has(b.app_name)) continue;
    if (!byApp.has(b.app_name)) byApp.set(b.app_name, b);
  }

  // Ensure we always show exactly the three banks, in a stable order.
  const fallbackByApp = new Map(FALLBACK_BANKS.map(b => [b.app_name, b] as const));
  return BANK_ORDER.map(app => byApp.get(app) ?? fallbackByApp.get(app)!).filter(Boolean);
}

const FEATURE_ICONS: Record<string, string> = {
  whisper_studio: '🎙️',
  ai_flashcards:  '🃏',
  ai_course:      '📖',
  ai_exercise_correction: '✨',
};

const ENABLED_FEATURE_KEYS = new Set<string>(['whisper_studio', 'ai_exercise_correction']);

// ── Balance bar ───────────────────────────────────────────────────────────────
function BalanceBar({ feature }: { feature: PremiumFeature }) {
  const total   = feature.totalToppedUpMru;
  const balance = feature.balanceMru;
  const spent   = feature.totalSpentMru;
  const pct     = total > 0 ? Math.round((spent / total) * 100) : 0;

  return (
    <View style={barStyles.container}>
      <View style={barStyles.row}>
        <Text style={barStyles.balance}>{balance.toLocaleString()} أوقية</Text>
        <Text style={barStyles.label}>رصيد متبقي</Text>
      </View>
      {total > 0 ? (
        <>
          <View style={barStyles.track}>
            <View style={[barStyles.fill, { width: (Math.min(pct, 100) + '%') as any }]} />
          </View>
          <View style={barStyles.row}>
            <Text style={barStyles.spent}>{spent.toLocaleString()} أوقية مُستخدمة</Text>
            <Text style={barStyles.pct}>{pct}%</Text>
          </View>
        </>
      ) : (
        <Text style={barStyles.empty}>لا يوجد رصيد — اشحن محفظتك</Text>
      )}
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { marginTop: 10 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  balance:   { fontSize: 16, fontWeight: '800', color: '#6D28D9' },
  label:     { fontSize: 11, color: '#9CA3AF' },
  track:     { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden', marginVertical: 4 },
  fill:      { height: '100%', backgroundColor: '#6D28D9', borderRadius: 4 },
  spent:     { fontSize: 11, color: '#6B7280' },
  pct:       { fontSize: 11, color: '#6B7280' },
  empty:     { fontSize: 12, color: '#EF4444', fontStyle: 'italic', marginTop: 4 },
});

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ feature, selected, onSelect, disabled }: {
  feature: PremiumFeature; selected: boolean; onSelect: () => void; disabled?: boolean;
}) {
  const icon = FEATURE_ICONS[feature.key] ?? '⭐';
  return (
    <TouchableOpacity
      style={[
        styles.featureCard,
        selected && styles.featureCardSelected,
        disabled && styles.featureCardDisabled,
      ]}
      onPress={onSelect}
      disabled={!!disabled}
      activeOpacity={0.8}
    >
      {disabled && (
        <View style={styles.soonBadge}>
          <Text style={styles.soonBadgeText}>soon</Text>
        </View>
      )}
      <View style={styles.featureCardRow}>
        <View style={[styles.featureIcon, selected && styles.featureIconSelected]}>
          <Text style={styles.featureIconText}>{icon}</Text>
        </View>
        <View style={styles.featureCardBody}>
          <Text style={styles.featureCardTitle}>{feature.label_ar}</Text>
          <Text style={styles.featureCardDesc} numberOfLines={2}>{feature.description_ar}</Text>
          <Text style={styles.featureCost}>💳 {feature.cost_per_use_mru} أوقية / استخدام</Text>
        </View>
        <View style={[
          styles.featureRadio,
          selected && styles.featureRadioSelected,
          disabled && styles.featureRadioDisabled,
        ]}>
          {selected && <View style={styles.featureRadioDot} />}
        </View>
      </View>
      <BalanceBar feature={feature} />
    </TouchableOpacity>
  );
}

// ── Bank item ─────────────────────────────────────────────────────────────────
function BankItem({ bank, selected, onSelect }: {
  bank: Bank; selected: boolean; onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.bankItem, selected && styles.bankItemSelected]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={[styles.bankIcon, selected && styles.bankIconSelected]}>
        <AppIcon name="wallet" size={18} color={selected ? '#1D4ED8' : '#6B7280'} />
      </View>
      <View style={styles.bankInfo}>
        <Text style={[styles.bankName, selected && styles.bankNameSelected]}>{bank.name_ar}</Text>
        <Text style={styles.bankApp}>{bank.app_name}</Text>
      </View>
      <View style={styles.bankRight}>
        {selected && (
          <View style={styles.bankCheckPill}>
            <AppIcon name="checkmarkCircle" size={16} color="#2563EB" />
            <Text style={styles.bankCheckText}>محدد</Text>
          </View>
        )}
        <AppIcon name={isRtl ? 'chevronBack' : 'chevronForward'} size={16} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
}

// ── Summary row ───────────────────────────────────────────────────────────────
function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryIcon}>{icon}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function PremiumRequestScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { token }  = useAuth();
  const { colors: C } = useTheme();
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [step,            setStep]            = useState<'feature' | 'payment' | 'confirm'>('feature');
  const [features,        setFeatures]        = useState<PremiumFeature[]>([]);
  const [banks,           setBanks]           = useState<Bank[]>(FALLBACK_BANKS);
  const [selectedFeature, setSelectedFeature] = useState<PremiumFeature | null>(null);
  const [selectedBank,    setSelectedBank]    = useState<Bank | null>(null);
  const [topupAmount,     setTopupAmount]     = useState('');
  const [screenshot,      setScreenshot]      = useState<{ uri: string; name: string; type: string } | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [fetching,        setFetching]        = useState(true);
  const [submitted,       setSubmitted]       = useState(false);

  const preselectedKey = (route.params as any)?.featureKey as string | undefined;

  const loadData = useCallback(async () => {
    if (!token) return;
    setFetching(true);
    try {
      const [featRes, bankRes] = await Promise.all([
        fetch(`${API_BASE}/billing/features`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/billing/banks`,    { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (featRes.ok) {
        const data: PremiumFeature[] = await featRes.json();
        setFeatures(data);
        if (preselectedKey) {
          const found = data.find(f => f.key === preselectedKey);
          if (found && ENABLED_FEATURE_KEYS.has(found.key)) {
            setSelectedFeature(found);
            setTopupAmount(String(found.min_recharge_mru ?? 100));
            setStep('payment');
          }
        }
      }
      if (bankRes.ok) {
        const bData: Bank[] = await bankRes.json();
        if (bData.length) {
          setBanks(normalizeBanks(bData));
        }
      }
    } catch { /* keep defaults */ }
    finally { setFetching(false); }
  }, [token, preselectedKey]);

  useEffect(() => { loadData(); }, [loadData]);

  const pickScreenshot = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('الأذونات مطلوبة', 'يرجى السماح بالوصول إلى الصور'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      setScreenshot({ uri: asset.uri, name: `screenshot.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('الكاميرا مطلوبة', 'يرجى السماح بالوصول إلى الكاميرا'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets.length > 0) {
      setScreenshot({ uri: result.assets[0].uri, name: 'screenshot.jpg', type: 'image/jpeg' });
    }
  };

  const parsedAmount = parseInt(topupAmount || '0') || 0;
  const amountValid  = parsedAmount >= 50;

  const handleSubmit = async () => {
    if (!selectedFeature || !selectedBank || !screenshot || !amountValid) {
      Alert.alert('معلومات ناقصة', 'يجب اختيار الميزة، المبلغ، البنك، وإرفاق صورة الإيصال');
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append('feature_key',  selectedFeature.key);
      form.append('bank_name',    selectedBank.name_ar);
      form.append('topup_amount', String(parsedAmount));
      form.append('screenshot', {
        uri:  Platform.OS === 'ios' ? screenshot.uri.replace('file://', '') : screenshot.uri,
        name: screenshot.name,
        type: screenshot.type,
      } as any);
      const res = await fetch(`${API_BASE}/billing/feature-request`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        body:    form,
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('خطأ', data?.error ?? 'فشل إرسال الطلب'); return; }
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('خطأ في الاتصال', e.message ?? 'تحقق من اتصالك بالإنترنت');
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={{ fontSize: 64, marginBottom: 16 }}>🎉</Text>
          <Text style={styles.successTitle}>تم إرسال طلبك!</Text>
          <Text style={styles.successDesc}>
            {'سيتم مراجعة إيصال الدفع وشحن محفظتك بـ '}
            <Text style={{ fontWeight: '800', color: '#6D28D9' }}>{parsedAmount.toLocaleString()} أوقية</Text>
            {'\n\nستصلك إشعار فور الموافقة.'}
          </Text>
          <TouchableOpacity style={styles.successBtn} onPress={() => safeBack(navigation)}>
            <Text style={styles.successBtnText}>العودة للتطبيق</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (fetching) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const stepIdx    = step === 'feature' ? 0 : step === 'payment' ? 1 : 2;
  const stepLabels = ['اختر الميزة', 'ادفع وأرفق', 'أرسل الطلب'];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.background }]}>
      {/* Header */}
      <LinearGradient colors={['#8B5CF6', '#7C3AED', '#EC4899']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <TouchableOpacity onPress={() => safeBack(navigation)} style={styles.backBtn} activeOpacity={0.8}>
          <AppIcon name="arrowBack" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>💎 شحن المحفظة</Text>
          <Text style={styles.headerSub}>ادفع ما تحتاج — كل ريال في محله</Text>
        </View>
        <TouchableOpacity 
          onPress={() => navigation.navigate('Spending')}
          style={styles.historyBtn}
          activeOpacity={0.85}
        >
          <AppIcon name="wallet" size={18} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Step indicator */}
      <View style={[styles.steps, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {stepLabels.map((label, i) => (
          <React.Fragment key={i}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, i <= stepIdx && styles.stepCircleActive]}>
                <Text style={[styles.stepNum, i <= stepIdx && styles.stepNumActive]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, i <= stepIdx && styles.stepLabelActive]}>{label}</Text>
            </View>
            {i < 2 && <View style={[styles.stepLine, i < stepIdx && styles.stepLineActive]} />}
          </React.Fragment>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── STEP 1: Choose feature ──────────────────────────────── */}
          {step === 'feature' && (
            <View>
              <Text style={styles.sectionTitle}>اختر الميزة التي تريد شحنها</Text>
              <Text style={styles.sectionSub}>كل ميزة لها محفظة مستقلة — ادفع فقط ما تحتاجه</Text>
              {features.map(f => (
                <FeatureCard
                  key={f.key}
                  feature={f}
                  selected={selectedFeature?.key === f.key}
                  disabled={!ENABLED_FEATURE_KEYS.has(f.key)}
                  onSelect={() => {
                    if (!ENABLED_FEATURE_KEYS.has(f.key)) return;
                    setSelectedFeature(f);
                    setTopupAmount(String(f.min_recharge_mru ?? 100));
                  }}
                />
              ))}
              <TouchableOpacity
                style={[styles.nextBtn, !selectedFeature && styles.nextBtnDisabled]}
                disabled={!selectedFeature}
                onPress={() => setStep('payment')}
              >
                <Text style={styles.nextBtnText}>التالي →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2: Amount + bank + screenshot ─────────────────── */}
          {step === 'payment' && selectedFeature && (
            <View>
              {/* Amount input */}
              <View style={styles.amountCard}>
                <Text style={styles.amountCardTitle}>💰 كم تريد أن تشحن؟</Text>
                <Text style={styles.amountCardSub}>
                  {'الحد الأدنى 50 أوقية — كل استخدام يخصم '}
                  {selectedFeature.cost_per_use_mru}
                  {' أوقية'}
                </Text>
                <View style={styles.amountInputRow}>
                  <TextInput
                    style={styles.amountInput}
                    value={topupAmount}
                    onChangeText={v => setTopupAmount(v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    placeholder="100"
                    placeholderTextColor="#9CA3AF"
                    textAlign="right"
                  />
                  <Text style={styles.amountUnit}>أوقية</Text>
                </View>
                {parsedAmount > 0 && (
                  <Text style={styles.amountUsages}>
                    {'≈ '}
                    {Math.floor(parsedAmount / selectedFeature.cost_per_use_mru)}
                    {' استخدام'}
                  </Text>
                )}
                <View style={styles.quickAmounts}>
                  {[100, 200, 500, 1000].map(a => (
                    <TouchableOpacity
                      key={a}
                      style={[styles.quickAmountBtn, parsedAmount === a && styles.quickAmountBtnActive]}
                      onPress={() => setTopupAmount(String(a))}
                    >
                      <Text style={[styles.quickAmountText, parsedAmount === a && styles.quickAmountTextActive]}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Payment instructions */}
              <View style={styles.paymentCard}>
                <Text style={styles.paymentCardTitle}>📋 كيف تدفع؟</Text>
                <Text style={styles.paymentInstructions}>
                  {'أرسل '}
                  <Text style={styles.paymentAmountHighlight}>
                    {parsedAmount > 0 ? parsedAmount.toLocaleString() : '…'}
                    {' أوقية'}
                  </Text>
                  {' إلى أحد الأرقام التالية:'}
                </Text>
                {PAYMENT_ACCOUNTS.map(acc => (
                  <View key={acc.bank} style={styles.accountBox}>
                    <View style={[styles.accountDot, { backgroundColor: acc.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accountBank}>{acc.bank}</Text>
                      <Text style={styles.accountNumber}>{acc.phone}</Text>
                    </View>
                  </View>
                ))}
                <Text style={styles.paymentNote}>
                  ⚠️ احفظ لقطة شاشة من التطبيق البنكي قبل المتابعة
                </Text>
              </View>

              {/* Bank picker */}
              <Text style={styles.sectionTitle}>اختر التطبيق الذي دفعت منه</Text>
              {banks.map(bank => (
                <BankItem
                  key={bank.id}
                  bank={bank}
                  selected={selectedBank?.id === bank.id}
                  onSelect={() => setSelectedBank(bank)}
                />
              ))}

              {/* Screenshot */}
              <Text style={styles.sectionTitle}>
                {'أرفق صورة الإيصال '}
                <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              <Text style={styles.sectionSub}>لقطة شاشة واضحة من التطبيق البنكي تُثبت الدفع</Text>
              {screenshot ? (
                <View style={styles.screenshotContainer}>
                  <Image source={{ uri: screenshot.uri }} style={styles.screenshotPreview} />
                  <TouchableOpacity style={styles.screenshotRemove} onPress={() => setScreenshot(null)}>
                    <Text style={styles.screenshotRemoveText}>✕ حذف</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.screenshotUploader}>
                  <Text style={{ fontSize: 40, marginBottom: 8 }}>📸</Text>
                  <Text style={styles.screenshotUploaderTitle}>أضف صورة الإيصال</Text>
                  <View style={styles.screenshotBtns}>
                    <TouchableOpacity style={styles.screenshotBtn} onPress={pickScreenshot}>
                      <Text style={styles.screenshotBtnText}>📂 من المعرض</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.screenshotBtn} onPress={takePhoto}>
                      <Text style={styles.screenshotBtnText}>📷 التقط صورة</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.navRow}>
                <TouchableOpacity style={styles.prevBtn} onPress={() => setStep('feature')}>
                  <Text style={styles.prevBtnText}>← رجوع</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nextBtn, styles.nextBtnFlex, (!selectedBank || !screenshot || !amountValid) && styles.nextBtnDisabled]}
                  disabled={!selectedBank || !screenshot || !amountValid}
                  onPress={() => setStep('confirm')}
                >
                  <Text style={styles.nextBtnText}>مراجعة الطلب →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── STEP 3: Confirm & submit ───────────────────────────── */}
          {step === 'confirm' && selectedFeature && selectedBank && screenshot && (
            <View>
              <Text style={styles.sectionTitle}>مراجعة الطلب</Text>
              <View style={styles.summaryCard}>
                <SummaryRow icon="💎" label="الميزة"           value={selectedFeature.label_ar} />
                <SummaryRow icon="💰" label="مبلغ الشحن"      value={`${parsedAmount.toLocaleString()} أوقية`} />
                <SummaryRow icon="🔄" label="عدد الاستخدامات" value={`≈ ${Math.floor(parsedAmount / selectedFeature.cost_per_use_mru)} استخدام`} />
                <SummaryRow icon="🏦" label="البنك"            value={selectedBank.name_ar} />
                <SummaryRow icon="📸" label="الإيصال"         value="✅ مرفق" />
              </View>
              <Image source={{ uri: screenshot.uri }} style={styles.screenshotFinal} />
              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnLoading]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>
                      {'📤 إرسال — شحن '}
                      {parsedAmount.toLocaleString()}
                      {' أوقية'}
                    </Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.prevBtn} onPress={() => setStep('payment')}>
                <Text style={styles.prevBtnText}>← تعديل</Text>
              </TouchableOpacity>
              <Text style={styles.disclaimer}>
                {'سيتم مراجعة طلبك خلال 24 ساعة.\nعند الموافقة ستُشحن محفظتك فوراً بـ '}
                {parsedAmount.toLocaleString()}
                {' أوقية.'}
              </Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:          { flex: 1 },
  centered:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Header
  header:      { paddingTop: 10, paddingBottom: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  historyBtn:     { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },

  // Step indicator
  steps:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  stepItem:         { alignItems: 'center', gap: 4 },
  stepCircle:       { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  stepCircleActive: { backgroundColor: '#6D28D9' },
  stepNum:          { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  stepNumActive:    { color: '#fff' },
  stepLabel:        { fontSize: 10, color: '#9CA3AF', textAlign: 'center', maxWidth: 60 },
  stepLabelActive:  { color: '#6D28D9', fontWeight: '600' },
  stepLine:         { flex: 1, height: 2, backgroundColor: '#E5E7EB', marginHorizontal: 4, marginBottom: 14 },
  stepLineActive:   { backgroundColor: '#6D28D9' },

  // Section
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 20, marginBottom: 6 },
  sectionSub:   { fontSize: 12, color: '#6B7280', marginBottom: 10, marginTop: -4 },

  // Feature card
  featureCard:         { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1.5, borderColor: '#E5E7EB', padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  featureCardSelected: { borderColor: '#6D28D9', backgroundColor: '#F5F3FF' },
  featureCardDisabled: { opacity: 0.55 },
  featureCardRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon:         { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  featureIconSelected: { backgroundColor: '#EDE9FE' },
  featureIconText:     { fontSize: 22 },
  featureCardBody:     { flex: 1 },
  featureCardTitle:    { fontSize: 15, fontWeight: '700', color: '#111827' },
  featureCardDesc:     { fontSize: 12, color: '#6B7280', marginTop: 2 },
  featureCost:         { fontSize: 12, color: '#6D28D9', fontWeight: '600', marginTop: 4 },
  featureRadio:        { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  featureRadioSelected:{ borderColor: '#6D28D9' },
  featureRadioDisabled:{ borderColor: '#D1D5DB' },
  featureRadioDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6D28D9' },
  soonBadge:           { position: 'absolute', top: 10, left: 10, backgroundColor: '#111827', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  soonBadgeText:       { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Amount card
  amountCard:            { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  amountCardTitle:       { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  amountCardSub:         { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  amountInputRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  amountInput:           { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#6D28D9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 22, fontWeight: '800', color: '#111827' },
  amountUnit:            { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  amountUsages:          { fontSize: 12, color: '#059669', fontWeight: '600', marginBottom: 12 },
  quickAmounts:          { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quickAmountBtn:        { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1.5, borderColor: 'transparent' },
  quickAmountBtnActive:  { backgroundColor: '#EDE9FE', borderColor: '#6D28D9' },
  quickAmountText:       { fontSize: 14, fontWeight: '600', color: '#374151' },
  quickAmountTextActive: { color: '#6D28D9' },

  // Payment card
  paymentCard:            { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  paymentCardTitle:       { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  paymentInstructions:    { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 10 },
  paymentAmountHighlight: { color: '#6D28D9', fontWeight: '800' },
  accountBox:             { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  accountDot:             { width: 12, height: 12, borderRadius: 6 },
  accountBank:            { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  accountNumber:          { fontSize: 20, fontWeight: '800', color: '#111827', letterSpacing: 2 },
  paymentNote:            { fontSize: 12, color: '#D97706', backgroundColor: '#FFFBEB', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FEF3C7', marginTop: 4 },

  // Banks
  bankItem:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  bankItemSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  bankIcon:         { width: 40, height: 40, borderRadius: 14, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  bankIconSelected: { backgroundColor: '#DBEAFE' },
  bankInfo:         { flex: 1 },
  bankName:         { fontSize: 14, fontWeight: '600', color: '#111827' },
  bankNameSelected: { color: '#1D4ED8' },
  bankApp:          { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  bankRight:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bankCheckPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  bankCheckText:    { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },

  // Screenshot
  screenshotContainer:     { position: 'relative', marginBottom: 16 },
  screenshotPreview:       { width: '100%', height: 200, borderRadius: 14, resizeMode: 'cover' },
  screenshotRemove:        { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  screenshotRemoveText:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  screenshotUploader:      { backgroundColor: '#fff', borderRadius: 18, borderWidth: 2, borderColor: '#D1D5DB', borderStyle: 'dashed', padding: 22, alignItems: 'center', marginBottom: 16 },
  screenshotUploaderTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 },
  screenshotBtns:          { flexDirection: 'row', gap: 10 },
  screenshotBtn:           { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  screenshotBtnText:       { fontSize: 13, fontWeight: '600', color: '#374151' },
  screenshotFinal:         { width: '100%', height: 160, borderRadius: 14, resizeMode: 'cover', marginBottom: 16 },

  // Navigation
  navRow:          { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 8 },
  nextBtn:         { backgroundColor: '#6D28D9', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12, shadowColor: '#6D28D9', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  nextBtnFlex:     { flex: 1 },
  nextBtnDisabled: { backgroundColor: '#C4B5FD', opacity: 0.7 },
  nextBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },
  prevBtn:         { backgroundColor: '#F3F4F6', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', marginTop: 8 },
  prevBtnText:     { color: '#374151', fontSize: 14, fontWeight: '600' },

  // Summary
  summaryCard:  { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', marginBottom: 16 },
  summaryRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  summaryIcon:  { fontSize: 18, width: 24, textAlign: 'center' },
  summaryLabel: { fontSize: 13, color: '#6B7280', flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#111827' },

  // Submit
  submitBtn:        { backgroundColor: '#6D28D9', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  submitBtnLoading: { opacity: 0.7 },
  submitBtnText:    { color: '#fff', fontSize: 15, fontWeight: '800' },
  disclaimer:       { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 18, marginTop: 8 },

  // Success
  successTitle:   { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 12, textAlign: 'center' },
  successDesc:    { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  successBtn:     { backgroundColor: '#6D28D9', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  successBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
