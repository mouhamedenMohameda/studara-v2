import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, API_BASE } from '@/utils/api';
import { MathText } from '@/components/latex/MathText';
import type { ExerciseCorrectionResult, JobStatus } from './types';

function toUserFacingAiError(raw: string): string {
  const m = String(raw || '').trim();
  const lc = m.toLowerCase();
  if (
    lc.includes('tokens per min') ||
    lc.includes('tpm') ||
    lc.includes('rate limit') ||
    lc.includes('request too large') ||
    lc.includes('too many tokens')
  ) {
    return "Le service est saturé ou l’énoncé est trop long. Réessaie dans 1–2 minutes, ou recadre la photo sur l’exercice.";
  }
  if (lc.includes('api key') || lc.includes('invalid_api_key')) {
    return "Le service IA n’est pas disponible (configuration). Réessaie plus tard.";
  }
  if (lc.includes('timeout')) return "Le service IA met trop de temps à répondre. Réessaie dans quelques secondes.";
  return "Une erreur est survenue pendant la génération. Réessaie, ou fournis une photo plus nette.";
}

function Box({ title, children }: any) {
  return (
    <View style={styles.box}>
      <Text style={styles.boxTitle}>{title}</Text>
      <View style={{ height: 8 }} />
      {children}
    </View>
  );
}

function hasLatexMarkers(s: string): boolean {
  const t = String(s || '');
  return t.includes('\\(') || t.includes('\\)') || t.includes('\\[') || t.includes('\\]') || t.includes('\\frac') || t.includes('\\sqrt') || t.includes('^') || t.includes('_');
}

function RenderTextOrMath({
  text,
  enableMath,
}: {
  text: string;
  enableMath: boolean;
}) {
  const content = sanitizeAiText(String(text || '').trim());
  if (!content) return null;
  if (looksLikeJson(content)) {
    return (
      <View style={styles.softWarn}>
        <Text style={styles.softWarnTitle}>Réponse IA non structurée</Text>
        <Text style={styles.softWarnSub}>
          Active “Expliquer plus simplement” ou réessaie avec une photo plus nette (recadrée sur l’exercice).
        </Text>
      </View>
    );
  }
  if (enableMath && hasLatexMarkers(content)) {
    return <MathText content={content} />;
  }
  return <Text style={styles.p}>{content}</Text>;
}

function stripCodeFences(s: string): string {
  let t = String(s || '').trim();
  // Remove common fenced blocks: ```json ... ``` or ``` ... ```
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z0-9_-]*\n?/, '');
    t = t.replace(/```$/m, '');
    t = t.trim();
  }
  return t;
}

function sanitizeAiText(s: string): string {
  let t = stripCodeFences(s);
  // Remove stray trailing fences/backticks
  t = t.replace(/```+/g, '').trim();
  // Prevent huge dumps from killing UI
  if (t.length > 25_000) t = t.slice(0, 25_000) + '…';
  return t;
}

function looksLikeJson(s: string): boolean {
  const t = String(s || '').trim();
  if (!t) return false;
  if (t.startsWith('{') && t.includes('"statement"')) return true;
  if (t.startsWith('{') && t.includes('"correction_step_by_step"')) return true;
  if (t.startsWith('{') && t.includes('"final_answer"')) return true;
  return false;
}

function tryParseJsonObject(s: string): any | null {
  const t = sanitizeAiText(s);
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  const sub = t.slice(first, last + 1);
  try {
    return JSON.parse(sub);
  } catch {
    return null;
  }
}

function normalizeExerciseResult(raw: any): ExerciseCorrectionResult | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const j = tryParseJsonObject(raw);
    return j && typeof j === 'object' ? (j as ExerciseCorrectionResult) : null;
  }
  if (typeof raw !== 'object') return null;

  // If any major field accidentally contains a JSON dump, try to parse it and salvage.
  const candidates = [
    raw?.statement,
    raw?.correction_step_by_step,
    raw?.method_explanation,
    raw?.final_answer,
  ].filter((x: any) => typeof x === 'string') as string[];
  for (const c of candidates) {
    if (!looksLikeJson(c)) continue;
    const j = tryParseJsonObject(c);
    if (j && typeof j === 'object' && typeof j.statement === 'string') {
      return {
        ...raw,
        ...j,
      } as ExerciseCorrectionResult;
    }
  }

  // Sanitize string fields (remove ```json fences etc.)
  return {
    ...raw,
    statement: sanitizeAiText(String(raw.statement || '')),
    correction_step_by_step: sanitizeAiText(String(raw.correction_step_by_step || '')),
    method_explanation: sanitizeAiText(String(raw.method_explanation || '')),
    final_answer: sanitizeAiText(String(raw.final_answer || '')),
    method_summary: sanitizeAiText(String(raw.method_summary || '')),
    similar_exercise: sanitizeAiText(String(raw.similar_exercise || '')),
  } as ExerciseCorrectionResult;
}

function AccordionBox({
  title,
  defaultOpen = true,
  rightHint,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  rightHint?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.box}>
      <TouchableOpacity style={styles.boxHeader} onPress={() => setOpen((v) => !v)} activeOpacity={0.85}>
        <Text style={styles.boxTitle}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!!rightHint && <Text style={styles.boxHint}>{rightHint}</Text>}
          <AppIcon name={open ? 'chevronUpOutline' : 'chevronDownOutline'} size={18} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>
      {open ? <View style={{ height: 8 }} /> : null}
      {open ? children : null}
    </View>
  );
}

export default function AIExerciseResultScreen({ navigation, route }: any) {
  const { token } = useAuth();
  const correctionId: string = route.params.correctionId;

  const [status, setStatus] = useState<JobStatus>('PENDING');
  const [result, setResult] = useState<ExerciseCorrectionResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [actionLoading, setActionLoading] = useState<'simplify' | 'similar' | null>(null);
  const [mathMode, setMathMode] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const tick = async () => {
      try {
        const data = await apiRequest<{
          status: JobStatus;
          result?: ExerciseCorrectionResult;
          warnings?: string[];
          errorMessage?: string;
        }>(`/ai/exercise-corrections/${correctionId}`, { token });
        if (!alive) return;
        setStatus(data.status);
        setResult(normalizeExerciseResult(data.result) || null);
        setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setErrorMessage(data.errorMessage || null);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, correctionId]);

  const exportPdf = async () => {
    if (!token) return;
    if (status !== 'COMPLETED') return;
    setExporting(true);
    try {
      const url = `${API_BASE}/ai/exercise-corrections/${correctionId}/export.pdf`;
      const dest = `${FileSystem.cacheDirectory}correction_${correctionId}.pdf`;
      const dl = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable');
      await Sharing.shareAsync(dl.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (e: any) {
      Alert.alert('Export PDF', e.message);
    } finally {
      setExporting(false);
    }
  };

  const simplify = async () => {
    if (!token) return;
    if (status !== 'COMPLETED') return;
    setActionLoading('simplify');
    try {
      const data = await apiRequest<{ result: ExerciseCorrectionResult }>(
        `/ai/exercise-corrections/${correctionId}/simplify`,
        { method: 'POST', token },
      );
      if (data?.result) setResult(normalizeExerciseResult(data.result) || data.result);
    } catch (e: any) {
      Alert.alert('Simplifier', e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const regenerateSimilar = async () => {
    if (!token) return;
    if (status !== 'COMPLETED') return;
    setActionLoading('similar');
    try {
      const data = await apiRequest<{ similar_exercise: string }>(
        `/ai/exercise-corrections/${correctionId}/similar-exercise`,
        { method: 'POST', token },
      );
      if (data?.similar_exercise && result) {
        setResult({ ...result, similar_exercise: data.similar_exercise });
      }
    } catch (e: any) {
      Alert.alert('Exercice similaire', e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const r = result;
  const confidence = typeof r?.confidence === 'number' ? r.confidence : null;
  const canMath = !!r?.latex?.enabled;
  const effectiveMathMode = mathMode && canMath;

  const confidenceText = useMemo(() => {
    if (confidence === null) return null;
    const pct = Math.round(confidence * 100);
    if (pct >= 85) return { label: `Confiance: ${pct}%`, color: '#16A34A' };
    if (pct >= 65) return { label: `Confiance: ${pct}%`, color: '#F59E0B' };
    return { label: `Confiance faible: ${pct}%`, color: '#EF4444' };
  }, [confidence]);

  const toggleMath = useCallback(() => {
    if (!canMath) return;
    setMathMode((v) => !v);
  }, [canMath]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <LinearGradient colors={Gradients.brand as any} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Correction</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={toggleMath}
                style={[styles.iconBtn, !canMath && { opacity: 0.45 }]}
                disabled={!canMath}
              >
                <AppIcon name="calculatorOutline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={exportPdf} style={styles.iconBtn} disabled={exporting || status !== 'COMPLETED'}>
                {exporting ? <ActivityIndicator color="#fff" /> : <AppIcon name="downloadOutline" size={22} color="#fff" />}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {status !== 'COMPLETED' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.centerText}>
            {status === 'FAILED' ? 'Échec génération' : 'Génération en cours…'}
          </Text>
          {!!errorMessage && (
            <Text style={[styles.centerText, { color: '#EF4444' }]}>{toUserFacingAiError(errorMessage)}</Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 140 }}>
          <View style={styles.titleCard}>
            <Text style={styles.title}>Correction IA d’exercice</Text>
            {confidenceText ? (
              <Text style={[styles.sub, { color: confidenceText.color }]}>{confidenceText.label}</Text>
            ) : (
              <Text style={styles.sub}>Analyse terminée</Text>
            )}
            {canMath ? (
              <TouchableOpacity onPress={toggleMath} activeOpacity={0.85} style={styles.mathPill}>
                <Text style={styles.mathPillText}>
                  {effectiveMathMode ? 'Mode Math: ON' : 'Mode Math: OFF'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {warnings?.length ? (
              <Text style={styles.warn}>{warnings.length} avertissement(s) — voir en bas</Text>
            ) : null}
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={simplify} disabled={actionLoading !== null}>
              {actionLoading === 'simplify' ? (
                <ActivityIndicator color="#7C3AED" />
              ) : (
                <AppIcon name="sparklesOutline" size={18} color="#7C3AED" />
              )}
              <Text style={styles.secondaryText}>Expliquer plus simplement</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={regenerateSimilar} disabled={actionLoading !== null}>
              {actionLoading === 'similar' ? (
                <ActivityIndicator color="#7C3AED" />
              ) : (
                <AppIcon name="refresh" size={18} color="#7C3AED" />
              )}
              <Text style={styles.secondaryText}>Exercice similaire</Text>
            </TouchableOpacity>
          </View>

          <Box title="Énoncé (reconnu)">
            <RenderTextOrMath text={r?.statement || ''} enableMath={effectiveMathMode} />
          </Box>

          <AccordionBox title="Correction étape par étape" defaultOpen rightHint={effectiveMathMode ? 'Math' : null}>
            <RenderTextOrMath text={r?.correction_step_by_step || ''} enableMath={effectiveMathMode} />
          </AccordionBox>

          <AccordionBox title="Méthode (explication)" defaultOpen={false}>
            <RenderTextOrMath text={r?.method_explanation || ''} enableMath={effectiveMathMode} />
          </AccordionBox>

          <Box title="Résultat final">
            <View style={styles.finalWrap}>
              <RenderTextOrMath text={r?.final_answer || ''} enableMath={effectiveMathMode} />
            </View>
          </Box>

          <AccordionBox title="Erreurs fréquentes" defaultOpen={false}>
            {(r?.common_errors || []).slice(0, 40).map((t: string, i: number) => (
              <Text key={i} style={styles.li}>• {t}</Text>
            ))}
          </AccordionBox>

          <AccordionBox title="Résumé de la méthode à retenir" defaultOpen={false}>
            <RenderTextOrMath text={r?.method_summary || ''} enableMath={effectiveMathMode} />
          </AccordionBox>

          <AccordionBox title="Exercice similaire (pour s’entraîner)" defaultOpen={false}>
            <RenderTextOrMath text={r?.similar_exercise || ''} enableMath={effectiveMathMode} />
          </AccordionBox>

          {r?.student_answer_feedback ? (
            <Box title="Correction de ta réponse">
              {(r.student_answer_feedback.errors || []).slice(0, 20).map((e: any, i: number) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <Text style={styles.li}><Text style={{ fontWeight: '900' }}>Erreur:</Text> {e.excerpt}</Text>
                  <Text style={styles.li}><Text style={{ fontWeight: '900' }}>Pourquoi:</Text> {e.why_wrong}</Text>
                  <Text style={styles.li}><Text style={{ fontWeight: '900' }}>Correction:</Text> {e.fix}</Text>
                </View>
              ))}
              <View style={{ height: 10 }} />
              <Text style={[styles.p, { fontWeight: '900' }]}>Solution propre</Text>
              <Text style={styles.p}>{r.student_answer_feedback.corrected_solution || ''}</Text>
            </Box>
          ) : null}

          {/* Legacy: keep compatibility if server sends LaTeX-heavy content but math mode is off */}
          {!effectiveMathMode && r?.latex?.enabled && (r?.correction_step_by_step || '').includes('\\') ? (
            <Box title="Math (aperçu)">
              <Text style={styles.p}>
                Astuce: active “Mode Math” pour un rendu propre des équations.
              </Text>
            </Box>
          ) : null}

          {r?.medical_disclaimer ? (
            <Box title="Avertissement (médecine)">
              <Text style={styles.p}>{r.medical_disclaimer}</Text>
            </Box>
          ) : null}

          {warnings?.length ? (
            <AccordionBox title="Ambiguïtés / avertissements" defaultOpen={false} rightHint={`${warnings.length}`}>
              {warnings.slice(0, 80).map((w: string, i: number) => (
                <Text key={i} style={styles.li}>• {w}</Text>
              ))}
            </AccordionBox>
          ) : null}
        </ScrollView>
      )}
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
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  centerText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  titleCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadows.sm,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  sub: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, marginTop: 6 },
  warn: { fontSize: 12, fontWeight: '700', color: '#B45309', marginTop: 6 },
  mathPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(124, 58, 237, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.25)',
  },
  mathPillText: { fontSize: 11, fontWeight: '900', color: '#7C3AED' },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    ...Shadows.xs,
  },
  secondaryText: { fontSize: 12, fontWeight: '800', color: '#7C3AED' },
  box: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadows.sm,
    marginBottom: 12,
  },
  boxTitle: { fontSize: 13, fontWeight: '900', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  boxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boxHint: { fontSize: 11, fontWeight: '900', color: Colors.textMuted },
  p: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  li: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22, marginBottom: 6 },
  finalWrap: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.18)',
  },
  softWarn: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.18)',
  },
  softWarnTitle: { fontSize: 13, fontWeight: '900', color: '#92400E' },
  softWarnSub: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#B45309', lineHeight: 18 },
});

