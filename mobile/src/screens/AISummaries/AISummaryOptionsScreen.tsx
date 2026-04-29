import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import SummaryCreditsCard from '@/components/cards/SummaryCreditsCard';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';

type DocStatus = 'UPLOADED' | 'TEXT_EXTRACTING' | 'TEXT_READY' | 'FAILED';
type Level = 'simple' | 'normal' | 'advanced' | 'very_synthetic' | 'exam_tomorrow';
type Lang = 'fr' | 'ar' | 'en' | 'fr_ar';

type CourseDocPricingResponse = {
  status: string;
  feature_key?: string;
  balance_mru: number;
  original_name?: string;
  pricing: null | {
    price_mru: number;
    basis: 'pages' | 'words' | 'fallback';
    per_page_mru?: number;
    per_1k_words_mru?: number;
    cap_mru_for_up_to_50_pages?: number;
  };
  word_count?: number | null;
};

export default function AISummaryOptionsScreen({ navigation, route }: any) {
  const { token } = useAuth();
  const documentId: string = route.params.documentId;

  const [docStatus, setDocStatus] = useState<DocStatus>('UPLOADED');
  const [level, setLevel] = useState<Level>('normal');
  const [lang, setLang] = useState<Lang>('fr');
  const [loading, setLoading] = useState(false);
  const [pricingPayload, setPricingPayload] = useState<CourseDocPricingResponse | null>(null);

  const loadStatus = useCallback(async (): Promise<DocStatus | null> => {
    if (!token) return null;
    try {
      const d = await apiRequest<{ status: DocStatus; errorMessage?: string }>(
        `/ai/course-summaries/documents/${documentId}`,
        { token },
      );
      setDocStatus(d.status);
      if (d.status === 'FAILED' && d.errorMessage) {
        Alert.alert('Extraction échouée', d.errorMessage);
      }
      return d.status;
    } catch {
      return null;
    }
  }, [token, documentId]);

  const loadPricing = useCallback(async () => {
    if (!token || docStatus !== 'TEXT_READY') return;
    try {
      const p = await apiRequest<CourseDocPricingResponse>(
        `/ai/course-summaries/documents/${documentId}/pricing`,
        { token },
      );
      setPricingPayload(p);
    } catch {
      setPricingPayload(null);
    }
  }, [token, documentId, docStatus]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const tick = async () => {
      const s = await loadStatus();
      if (!alive) return;
      if (!s) return;
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, documentId, loadStatus]);

  useEffect(() => {
    if (docStatus !== 'TEXT_READY' || !token) {
      setPricingPayload(null);
      return;
    }
    let alive = true;
    loadPricing();
    const id = setInterval(() => {
      if (alive) loadPricing();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [docStatus, token, loadPricing]);

  const displayBalance = pricingPayload?.balance_mru ?? 0;
  const chargeMru = docStatus === 'TEXT_READY' ? pricingPayload?.pricing?.price_mru ?? null : null;
  const canPay = chargeMru != null && displayBalance >= chargeMru;
  const canGenerate = useMemo(
    () => docStatus === 'TEXT_READY' && !loading && canPay,
    [docStatus, loading, canPay],
  );

  const generate = async () => {
    if (!token) return;
    // Re-check server status to avoid UI/backend mismatch on slow extraction.
    const latest = await loadStatus();
    const effective = latest || docStatus;
    if (effective !== 'TEXT_READY') {
      return Alert.alert('Patiente', "Le texte n'est pas encore prêt. Réessaie dans quelques secondes.");
    }
    setLoading(true);
    try {
      const r = await apiRequest<{ summaryId: string }>(`/ai/course-summaries`, {
        method: 'POST',
        token,
        body: { documentId, level, outputLanguage: lang },
      });
      navigation.navigate('AISummaryResult', { summaryId: r.summaryId });
    } catch (e: any) {
      if (e.status === 402 && (e.body as any)?.code === 'wallet_insufficient') {
        const req = (e.body as any)?.required_mru ?? '?';
        const bal = (e.body as any)?.balance_mru ?? '?';
        Alert.alert(
          'Solde insuffisant',
          `Ce résumé coûte ${req} MRU. Ton solde : ${bal} MRU.`,
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Recharger',
              onPress: () => navigation.navigate('BillingHub'),
            },
          ],
        );
      } else
      if (String(e?.message || '').toLowerCase().includes('text not ready')) {
        await loadStatus();
        Alert.alert('Patiente', "Le texte est encore en extraction. Réessaie dans quelques secondes.");
      } else {
        Alert.alert('Erreur', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const Chip = ({ active, label, onPress }: any) => (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <LinearGradient colors={Gradients.brand as any} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Options</Text>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <SummaryCreditsCard
          balanceMru={displayBalance}
          balanceLoading={docStatus === 'TEXT_READY' && !pricingPayload}
          chargeMru={chargeMru}
          basis={pricingPayload?.pricing?.basis ?? null}
          pageCount={null}
          wordCount={pricingPayload?.word_count ?? null}
          estimateHint={
            docStatus !== 'TEXT_READY'
              ? 'Estimation affichée dès que le texte est extrait…'
              : !pricingPayload
                ? 'Calcul du prix en cours…'
                : null
          }
          onRecharge={() => navigation.navigate('BillingHub')}
        />

        {docStatus === 'TEXT_READY' && chargeMru != null && !canPay ? (
          <Text style={styles.warnInline}>Recharge ton wallet pour continuer.</Text>
        ) : null}

        <View style={styles.card}>
          <View style={styles.statusRow}>
            {docStatus === 'TEXT_READY' ? (
              <AppIcon name="checkmarkCircle" size={18} color="#16A34A" />
            ) : docStatus === 'FAILED' ? (
              <AppIcon name="alertCircleOutline" size={18} color="#EF4444" />
            ) : (
              <ActivityIndicator color="#7C3AED" />
            )}
            <Text style={styles.statusText}>
              {docStatus === 'TEXT_READY'
                ? 'Texte prêt'
                : docStatus === 'FAILED'
                  ? 'Échec extraction'
                  : 'Extraction en cours…'}
            </Text>
          </View>
          {docStatus === 'TEXT_READY' && (
            <Text style={styles.hint}>
              Appuie sur « Générer le résumé ». Ça prend en général 10–60 secondes selon la taille.
            </Text>
          )}

          <Text style={styles.h}>Niveau</Text>
          <View style={styles.chipWrap}>
            <Chip active={level === 'simple'} label="Simple" onPress={() => setLevel('simple')} />
            <Chip active={level === 'normal'} label="Normal" onPress={() => setLevel('normal')} />
            <Chip active={level === 'advanced'} label="Avancé" onPress={() => setLevel('advanced')} />
            <Chip active={level === 'very_synthetic'} label="Très synthétique" onPress={() => setLevel('very_synthetic')} />
            <Chip active={level === 'exam_tomorrow'} label="Examen demain" onPress={() => setLevel('exam_tomorrow')} />
          </View>

          <Text style={styles.h}>Langue</Text>
          <View style={styles.chipWrap}>
            <Chip active={lang === 'fr'} label="Français" onPress={() => setLang('fr')} />
            <Chip active={lang === 'ar'} label="Arabe" onPress={() => setLang('ar')} />
            <Chip active={lang === 'en'} label="Anglais" onPress={() => setLang('en')} />
            <Chip active={lang === 'fr_ar'} label="FR/AR" onPress={() => setLang('fr_ar')} />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, !canGenerate && { opacity: 0.6 }]}
            onPress={generate}
            disabled={!canGenerate}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <AppIcon name="sparkles" size={18} color="#fff" />
                <Text style={styles.primaryText}>Générer le résumé</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: 10 },
  headerTitle: { fontSize: 19, fontWeight: '900', color: '#fff' },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: Spacing.lg, paddingBottom: 120 },
  card: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadows.sm,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statusText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: -2, marginBottom: 10, lineHeight: 16 },
  warnInline: { marginBottom: 10, color: '#9A3412', fontWeight: '800' },
  h: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, marginTop: 14, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' },
  chipText: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  chipTextActive: { color: '#7C3AED' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', borderRadius: 16, paddingVertical: 14, marginTop: 18 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

