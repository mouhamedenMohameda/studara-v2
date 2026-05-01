import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StatusBar, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';

import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import { apiRequest, API_BASE } from '../../utils/api';
import { safeBack } from '../../utils/safeBack';
import { BorderRadius, Colors, Shadows, Spacing } from '../../theme';

type PrizePayload = {
  date: string;
  faculty: string;
  winner: null | {
    userId: string;
    name: string;
    timeTakenS: number;
    referralCount: number;
  };
  isWinner: boolean;
  prize: null | {
    id: string;
    challenge_date: string;
    faculty: string;
    phone: string;
    provider: 'bankily' | 'sedad' | 'masrivi';
    account_full_name: string;
    submitted_at: string;
    admin_proof_url: string | null;
    admin_proof_uploaded_at: string | null;
    user_confirmed_at: string | null;
    time_taken_s: number | null;
    referral_count: number;
  };
};

export default function DailyChallengeWinnerScreen() {
  const navigation = useNavigation<any>();
  const { token, user } = useAuth();
  const { colors: C, isDark } = useTheme();
  const { lang } = useLanguage();
  const { fontSize } = useAccessibility();
  const isAr = lang === 'ar';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PrizePayload | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState<'bankily' | 'sedad' | 'masrivi'>('bankily');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(false);
        const r = await apiRequest<PrizePayload>('/daily-challenge/prize', { token: token! });
        if (!mounted) return;
        setData(r);
        if (r?.prize) {
          setPhone(r.prize.phone ?? '');
          setProvider((r.prize.provider as any) || 'bankily');
          setFullName(r.prize.account_full_name ?? '');
        }
      } catch {
        if (!mounted) return;
        setError(true);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  const isMeWinner = useMemo(() => {
    if (!data?.winner?.userId || !user?.id) return false;
    return data.winner.userId === user.id;
  }, [data?.winner?.userId, user?.id]);

  const proofUrl = useMemo(() => {
    if (!data?.prize?.admin_proof_url) return null;
    // Serve proof via /api/v1 so Nginx proxy works; image request includes auth headers.
    return `${API_BASE}/daily-challenge/prize/proof`;
  }, [data?.prize?.admin_proof_url]);

  const reload = async () => {
    try {
      setLoading(true);
      setError(false);
      const r = await apiRequest<PrizePayload>('/daily-challenge/prize', { token: token! });
      setData(r);
      if (r?.prize) {
        setPhone(r.prize.phone ?? '');
        setProvider((r.prize.provider as any) || 'bankily');
        setFullName(r.prize.account_full_name ?? '');
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const submitPayoutInfo = async () => {
    if (!phone.trim() || !fullName.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest('/daily-challenge/prize', {
        method: 'POST',
        token: token!,
        body: {
          phone: phone.trim(),
          provider,
          accountFullName: fullName.trim(),
        },
      });
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReceipt = async () => {
    setConfirming(true);
    try {
      await apiRequest('/daily-challenge/prize/confirm', { method: 'POST', token: token!, body: {} });
      await reload();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={{ paddingBottom: 14, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: C.primary }}>
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: 4 }}>
            <TouchableOpacity
              onPress={() => safeBack(navigation)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                marginRight: 12,
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.28)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize(18), letterSpacing: -0.3 }}>
                {isAr ? '🏆 كأس اليوم' : '🏆 Trophée du jour'}
              </Text>
              {!!data?.date && (
                <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: fontSize(11), fontWeight: '600', marginTop: 2 }}>
                  {data.date}
                  {data.faculty && data.faculty !== 'all' ? ` · ${data.faculty}` : ''}
                </Text>
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: C.textSecondary, fontSize: fontSize(14) }}>
            {isAr ? 'جاري التحقق من الفائز…' : 'Vérification du gagnant…'}
          </Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 28 }}>
          <Text style={{ fontSize: 56 }}>😕</Text>
          <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(18), textAlign: 'center' }}>
            {isAr ? 'تعذّر تحميل الفائز' : 'Impossible de charger le gagnant'}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.replace('DailyChallengeWinner')}
            style={{ backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>
              {isAr ? 'إعادة المحاولة' : 'Réessayer'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : !data?.winner ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Text style={{ fontSize: 72 }}>⏳</Text>
          <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(22), textAlign: 'center', marginTop: 12 }}>
            {isAr ? 'لا يوجد فائز بعد' : 'Pas de gagnant pour le moment'}
          </Text>
          <Text style={{ color: C.textSecondary, fontSize: fontSize(14), textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
            {isAr
              ? 'عند انتهاء التحدي وتأكيد النتائج، سيظهر الفائز هنا.'
              : 'Une fois le défi terminé et les résultats confirmés, le gagnant apparaîtra ici.'}
          </Text>
        </ScrollView>
      ) : !isMeWinner ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Text style={{ fontSize: 72 }}>🔒</Text>
          <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(22), textAlign: 'center', marginTop: 12 }}>
            {isAr ? 'صفحة مخصصة للفائز فقط' : 'Page réservée au gagnant'}
          </Text>
          <Text style={{ color: C.textSecondary, fontSize: fontSize(14), textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
            {isAr
              ? 'هذه الصفحة تظهر فقط للفائز في تحدي اليوم.'
              : 'Cette page est visible uniquement pour le gagnant du défi du jour.'}
          </Text>
          <View style={{ marginTop: 18, alignSelf: 'stretch' }}>
            <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 }}>
              <Text style={{ color: C.textMuted, fontWeight: '900', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
                {isAr ? 'الفائز اليوم' : 'Gagnant du jour'}
              </Text>
              <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(18), marginTop: 10 }}>
                {data.winner.name}
              </Text>
              <Text style={{ color: C.textSecondary, marginTop: 6 }}>
                {isAr ? 'الوقت: ' : 'Temps: '}
                <Text style={{ color: Colors.primary, fontWeight: '900' }}>{data.winner.timeTakenS}s</Text>
                {isAr ? ' · إحالات: ' : ' · Parrainages: '}
                <Text style={{ color: Colors.primary, fontWeight: '900' }}>{data.winner.referralCount}</Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          <View
            style={{
              borderRadius: BorderRadius['2xl'],
              padding: 26,
              alignItems: 'center',
              backgroundColor: C.primary,
              ...Shadows.brand,
            }}
          >
            <Text style={{ fontSize: 72 }}>🏆</Text>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize(22), marginTop: 10, textAlign: 'center' }}>
              {isAr ? 'مبروك! أنت الفائز اليوم' : 'Bravo! Tu es le gagnant du jour'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize(13), marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
              {isAr
                ? 'أدخل معلومات الاستلام مرة واحدة ثم أكد. بعد التأكيد لا يمكن تعديلها.'
                : 'Saisis tes infos de réception une seule fois puis confirme. Après confirmation, tu ne pourras plus modifier.'}
            </Text>
          </View>

          {/* Phase A: user hasn't submitted payout info yet */}
          {(!data?.prize) && (
            <View style={{ marginTop: 14, gap: 10 }}>
              <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 }}>
                <Text style={{ color: C.textMuted, fontWeight: '900', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {isAr ? 'معلومات الاستلام' : 'Infos de réception'}
                </Text>

                <Text style={{ color: C.textSecondary, marginTop: 10, fontWeight: '700' }}>
                  {isAr ? 'رقم الهاتف' : 'Numéro de téléphone'}
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={isAr ? 'مثال: 22223333' : 'Ex: 22223333'}
                  keyboardType="phone-pad"
                  placeholderTextColor={C.textMuted}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: C.textPrimary,
                    backgroundColor: C.background,
                  }}
                />

                <Text style={{ color: C.textSecondary, marginTop: 12, fontWeight: '700' }}>
                  {isAr ? 'اختر الطريقة' : 'Choisir le service'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {(['bankily', 'sedad', 'masrivi'] as const).map((p) => {
                    const active = provider === p;
                    const label = p === 'bankily' ? 'Bankily' : p === 'sedad' ? 'Sedad' : 'Masrivi';
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setProvider(p)}
                        style={{
                          flex: 1,
                          borderRadius: 14,
                          paddingVertical: 12,
                          alignItems: 'center',
                          borderWidth: 1.5,
                          borderColor: active ? Colors.primary : C.border,
                          backgroundColor: active ? Colors.primary + '22' : C.surface,
                        }}
                      >
                        <Text style={{ color: active ? Colors.primary : C.textPrimary, fontWeight: '900' }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={{ color: C.textSecondary, marginTop: 12, fontWeight: '700' }}>
                  {isAr ? 'الاسم واللقب (في التطبيق المختار)' : 'Nom & prénom (dans le service choisi)'}
                </Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={isAr ? 'اكتب الاسم كما هو في Bankily/Sedad/Masrivi' : 'Nom exact dans Bankily/Sedad/Masrivi'}
                  placeholderTextColor={C.textMuted}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: C.textPrimary,
                    backgroundColor: C.background,
                  }}
                />

                <View style={{ marginTop: 12, backgroundColor: '#F59E0B22', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#F59E0B55' }}>
                  <Text style={{ color: C.textPrimary, fontWeight: '900' }}>
                    {isAr ? 'مهم' : 'Important'}
                  </Text>
                  <Text style={{ color: C.textSecondary, marginTop: 6, lineHeight: 20 }}>
                    {isAr
                      ? 'بعد التأكيد، لن تتمكن من تعديل هذه المعلومات.'
                      : 'Après confirmation, tu ne pourras plus modifier ces informations.'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={submitPayoutInfo}
                disabled={submitting || !phone.trim() || !fullName.trim()}
                style={{
                  borderRadius: 14,
                  backgroundColor: Colors.primary,
                  opacity: submitting || !phone.trim() || !fullName.trim() ? 0.6 : 1,
                  paddingVertical: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize(15) }}>
                  {submitting ? (isAr ? 'جاري الإرسال…' : 'Envoi…') : (isAr ? '✅ تأكيد وإرسال' : '✅ Confirmer & envoyer')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Phase B: submitted, waiting admin proof */}
          {(data?.prize && !data.prize.admin_proof_url && !data.prize.user_confirmed_at) && (
            <View style={{ marginTop: 14, gap: 10 }}>
              <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 }}>
                <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(18) }}>
                  {isAr ? 'تم الإرسال ✅' : 'Envoyé ✅'}
                </Text>
                <Text style={{ color: C.textSecondary, marginTop: 8, lineHeight: 20 }}>
                  {isAr
                    ? 'لقد أرسلت معلومات الاستلام. سيتم مراجعتها من طرف الإدارة، ثم سترى إثبات الإرسال هنا.'
                    : 'Tes informations ont été envoyées. L’admin va les traiter puis ajouter une capture de preuve ici.'}
                </Text>
                <View style={{ marginTop: 12, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12 }}>
                  <Text style={{ color: C.textMuted, fontWeight: '900', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {isAr ? 'معلوماتك (مقفلة)' : 'Tes infos (verrouillées)'}
                  </Text>
                  <Text style={{ color: C.textPrimary, fontWeight: '800', marginTop: 8 }}>
                    {data.prize.provider.toUpperCase()} · {data.prize.phone}
                  </Text>
                  <Text style={{ color: C.textSecondary, marginTop: 4 }}>{data.prize.account_full_name}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={reload} style={{ borderRadius: 14, borderWidth: 1.5, borderColor: Colors.primary, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: Colors.primary, fontWeight: '900', fontSize: fontSize(15) }}>
                  {isAr ? 'تحديث' : 'Rafraîchir'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Phase C: proof uploaded, user must confirm */}
          {(data?.prize?.admin_proof_url && !data.prize.user_confirmed_at) && (
            <View style={{ marginTop: 14, gap: 10 }}>
              <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 }}>
                <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(18) }}>
                  {isAr ? 'إثبات الإرسال' : 'Preuve d’envoi'}
                </Text>
                <Text style={{ color: C.textSecondary, marginTop: 8, lineHeight: 20 }}>
                  {isAr ? 'راجع الصورة ثم أكد الاستلام.' : 'Vérifie la capture puis confirme la réception.'}
                </Text>
                {proofUrl && (
                  <View style={{ marginTop: 12, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
                    <Image
                      source={{ uri: proofUrl, headers: { Authorization: `Bearer ${token}` } as any }}
                      style={{ width: '100%', height: 360, backgroundColor: C.background }}
                      resizeMode="cover"
                    />
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={confirmReceipt}
                disabled={confirming}
                style={{
                  borderRadius: 14,
                  backgroundColor: Colors.primary,
                  opacity: confirming ? 0.7 : 1,
                  paddingVertical: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize(15) }}>
                  {confirming ? (isAr ? 'جاري التأكيد…' : 'Confirmation…') : (isAr ? '✅ أكد الاستلام' : '✅ Confirmer la réception')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Phase D: confirmed -> history */}
          {(data?.prize?.user_confirmed_at) && (
            <View style={{ marginTop: 14, gap: 10 }}>
              <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 }}>
                <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(18) }}>
                  {isAr ? '🏆 سجل الفوز' : '🏆 Historique'}
                </Text>
                <Text style={{ color: C.textSecondary, marginTop: 8, lineHeight: 20 }}>
                  {isAr
                    ? `لقد فزت يوم ${data.date} بزمن ${data.winner?.timeTakenS ?? 0}s.`
                    : `Tu as gagné le ${data.date} avec un temps de ${data.winner?.timeTakenS ?? 0}s.`}
                </Text>
                <View style={{ marginTop: 12, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12 }}>
                  <Text style={{ color: C.textMuted, fontWeight: '900', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {isAr ? 'Détails' : 'Détails'}
                  </Text>
                  <Text style={{ color: C.textPrimary, fontWeight: '800', marginTop: 8 }}>
                    {data.prize.provider.toUpperCase()} · {data.prize.phone}
                  </Text>
                  <Text style={{ color: C.textSecondary, marginTop: 4 }}>{data.prize.account_full_name}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => safeBack(navigation)} style={{ borderRadius: 14, borderWidth: 1.5, borderColor: Colors.primary, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: Colors.primary, fontWeight: '900', fontSize: fontSize(15) }}>
                  {isAr ? '← العودة' : '← Retour'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

