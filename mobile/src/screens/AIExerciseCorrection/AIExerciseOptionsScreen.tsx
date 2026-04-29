import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import ExerciseCreditsCard from '@/components/cards/ExerciseCreditsCard';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { usePremiumFeature } from '@/hooks/usePremiumFeature';
import { apiRequest } from '@/utils/api';
import type { DocStatus, ExerciseSubject } from './types';

type ExerciseDocPricingResponse = {
  status: string;
  feature_key?: string;
  balance_mru: number;
  pricing: null | {
    price_mru: number;
    basis: 'pages' | 'words' | 'fallback';
    per_page_mru?: number;
    per_1k_words_mru?: number;
    cap_mru_for_up_to_50_pages?: number;
  };
  page_count?: number | null;
  word_count?: number;
  is_photo?: boolean;
};

const SUBJECTS: { key: ExerciseSubject; label: string }[] = [
  { key: 'mathematiques', label: 'Mathématiques' },
  { key: 'physique', label: 'Physique' },
  { key: 'chimie', label: 'Chimie' },
  { key: 'economie', label: 'Économie' },
  { key: 'comptabilite', label: 'Comptabilité' },
  { key: 'finance', label: 'Finance' },
  { key: 'informatique', label: 'Informatique' },
  { key: 'biologie', label: 'Biologie' },
  { key: 'medecine', label: 'Médecine' },
];

export default function AIExerciseOptionsScreen({ navigation, route }: any) {
  const { token } = useAuth();
  const documentId: string = route.params.documentId;

  const { balanceMru, loading: walletLoading, refetch: refetchWallet } = usePremiumFeature('ai_exercise_correction', 12_000);

  const [docStatus, setDocStatus] = useState<DocStatus>('UPLOADED');
  const [subject, setSubject] = useState<ExerciseSubject>('mathematiques');
  const [studentAnswer, setStudentAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [pricingPayload, setPricingPayload] = useState<ExerciseDocPricingResponse | null>(null);

  const loadStatus = useCallback(async (): Promise<DocStatus | null> => {
    if (!token) return null;
    try {
      const d = await apiRequest<{ status: DocStatus; errorMessage?: string }>(
        `/ai/exercise-corrections/documents/${documentId}`,
        { token },
      );
      setDocStatus(d.status);
      if (d.status === 'FAILED' && d.errorMessage) Alert.alert('Extraction échouée', d.errorMessage);
      return d.status;
    } catch {
      return null;
    }
  }, [token, documentId]);

  const loadPricing = useCallback(async () => {
    if (!token || docStatus !== 'TEXT_READY') return;
    try {
      const p = await apiRequest<ExerciseDocPricingResponse>(
        `/ai/exercise-corrections/documents/${documentId}/pricing`,
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

  const displayBalance = pricingPayload?.balance_mru ?? balanceMru;
  const chargeMru = docStatus === 'TEXT_READY' ? pricingPayload?.pricing?.price_mru ?? null : null;
  const canPay = chargeMru != null && displayBalance >= chargeMru;
  const canGenerate = useMemo(
    () => docStatus === 'TEXT_READY' && !loading && canPay,
    [docStatus, loading, canPay],
  );

  const generate = async () => {
    if (!token) return;
    const latest = await loadStatus();
    const effective = latest || docStatus;
    if (effective !== 'TEXT_READY') {
      return Alert.alert('Patiente', "Le texte n'est pas encore prêt. Réessaie dans quelques secondes.");
    }
    setLoading(true);
    try {
      const r = await apiRequest<{ correctionId: string }>(`/ai/exercise-corrections`, {
        method: 'POST',
        token,
        body: {
          documentId,
          subject,
          studentAnswer: studentAnswer.trim() || undefined,
          outputLanguage: 'fr',
        },
      });
      void refetchWallet();
      navigation.navigate('AIExerciseResult', { correctionId: r.correctionId });
    } catch (e: any) {
      if (e.status === 402 && (e.body as any)?.code === 'wallet_insufficient') {
        const req = (e.body as any)?.required_mru ?? '?';
        const bal = (e.body as any)?.balance_mru ?? '?';
        Alert.alert(
          'Solde insuffisant',
          `Cette correction coûte ${req} MRU. Ton solde : ${bal} MRU.`,
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Recharger',
              onPress: () => navigation.navigate('PremiumRequest', { featureKey: 'ai_exercise_correction' }),
            },
          ],
        );
      } else {
        Alert.alert('Erreur', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const Chip = ({ active, label, onPress }: any) => (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]} disabled={loading}>
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

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
        <ExerciseCreditsCard
          balanceMru={displayBalance}
          balanceLoading={walletLoading && !pricingPayload}
          chargeMru={chargeMru}
          basis={pricingPayload?.pricing?.basis ?? null}
          pageCount={pricingPayload?.page_count ?? null}
          wordCount={pricingPayload?.word_count ?? null}
          isPhoto={pricingPayload?.is_photo}
          estimateHint={
            docStatus !== 'TEXT_READY'
              ? 'Estimation affichée dès que le texte est extrait…'
              : !pricingPayload
                ? 'Calcul du prix en cours…'
                : null
          }
          onRecharge={() => navigation.navigate('PremiumRequest', { featureKey: 'ai_exercise_correction' })}
        />

        {docStatus === 'TEXT_READY' && chargeMru != null && !canPay ? (
          <Text style={styles.warnInline}>Recharge ton portefeuille « correction IA » pour continuer.</Text>
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
          {docStatus !== 'TEXT_READY' ? (
            <Text style={styles.hint}>
              Si l’image est floue ou l’énoncé incomplet, l’IA le signalera (et pourra demander une photo plus nette).
            </Text>
          ) : (
            <Text style={styles.hint}>Choisis la matière, puis génère la correction.</Text>
          )}

          <Text style={styles.h}>Matière</Text>
          <View style={styles.chipWrap}>
            {SUBJECTS.map((s) => (
              <Chip key={s.key} active={subject === s.key} label={s.label} onPress={() => setSubject(s.key)} />
            ))}
          </View>

          <Text style={styles.h}>Ta réponse (optionnel)</Text>
          <TextInput
            style={styles.textarea}
            value={studentAnswer}
            onChangeText={setStudentAnswer}
            placeholder="Colle ici ta réponse si tu l’as déjà. L’IA corrigera et expliquera les erreurs."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={8000}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, !canGenerate && { opacity: 0.6 }]}
            onPress={generate}
            disabled={!canGenerate}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <AppIcon name="sparkles" size={18} color="#fff" />
                <Text style={styles.primaryText}>Générer la correction</Text>
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
  h: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, marginTop: 14, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' },
  chipText: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  chipTextActive: { color: '#7C3AED' },
  textarea: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 120,
    fontSize: 14,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', borderRadius: 16, paddingVertical: 14, marginTop: 18 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  warnInline: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    marginTop: -4,
    lineHeight: 16,
  },
});

