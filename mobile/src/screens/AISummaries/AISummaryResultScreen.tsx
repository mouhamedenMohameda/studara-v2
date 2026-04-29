import React, { useEffect, useState } from 'react';
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

type Status = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

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
    return "Le cours est trop long ou le service est saturé. Réessaie dans 1–2 minutes, ou importe une partie du document (ex: 10–20 pages).";
  }
  if (lc.includes('openai_api_key') || lc.includes('api key') || lc.includes('invalid_api_key')) {
    return "Le service IA n’est pas disponible (configuration). Réessaie plus tard.";
  }
  if (lc.includes('quota')) return "Le quota IA est atteint pour le moment. Réessaie plus tard.";
  if (lc.includes('timeout')) return "Le service IA met trop de temps à répondre. Réessaie dans quelques secondes.";
  return "Une erreur est survenue pendant la génération. Réessaie, ou importe un document plus court.";
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

export default function AISummaryResultScreen({ navigation, route }: any) {
  const { token } = useAuth();
  const summaryId: string = route.params.summaryId;
  const [status, setStatus] = useState<Status>('PENDING');
  const [result, setResult] = useState<any>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const tick = async () => {
      try {
        const data = await apiRequest<{
          status: Status;
          result?: any;
          warnings?: string[];
          errorMessage?: string;
        }>(`/ai/course-summaries/${summaryId}`, { token });
        if (!alive) return;
        setStatus(data.status);
        setResult(data.result || null);
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
  }, [token, summaryId]);

  const exportPdf = async () => {
    if (!token) return;
    if (status !== 'COMPLETED') return;
    setExporting(true);
    try {
      const url = `${API_BASE}/ai/course-summaries/${summaryId}/export.pdf`;
      const dest = `${FileSystem.cacheDirectory}resume_${summaryId}.pdf`;
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

  const r = result || {};

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <LinearGradient colors={Gradients.brand as any} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Résultat</Text>
            <TouchableOpacity onPress={exportPdf} style={styles.iconBtn} disabled={exporting || status !== 'COMPLETED'}>
              {exporting ? <ActivityIndicator color="#fff" /> : <AppIcon name="downloadOutline" size={22} color="#fff" />}
            </TouchableOpacity>
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
            <Text style={[styles.centerText, { color: '#EF4444' }]}>
              {toUserFacingAiError(errorMessage)}
            </Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
          <View style={styles.titleCard}>
            <Text style={styles.title}>{r.title || 'Résumé'}</Text>
            {warnings?.length ? (
              <Text style={styles.warn}>{warnings.length} avertissement(s) — voir en bas</Text>
            ) : null}
          </View>

          <Box title="Résumé court">
            <Text style={styles.p}>{r.short_summary || ''}</Text>
          </Box>

          <Box title="Résumé complet">
            <Text style={styles.p}>{r.full_summary || ''}</Text>
          </Box>

          <Box title="Fiche de révision">
            {(r.revision_sheet?.key_points || []).slice(0, 40).map((p: string, i: number) => (
              <Text key={i} style={styles.li}>• {p}</Text>
            ))}
          </Box>

          <Box title="Définitions importantes">
            {(r.important_definitions || []).slice(0, 40).map((d: any, i: number) => (
              <Text key={i} style={styles.li}>
                <Text style={{ fontWeight: '900' }}>{d.term}</Text>
                {' — '}{d.definition}
              </Text>
            ))}
          </Box>

          <Box title="Formules importantes">
            {(r.important_formulas || []).slice(0, 40).map((f: any, i: number) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <Text style={styles.li}><Text style={{ fontWeight: '900' }}>{f.name}</Text>{' — '}{f.formula}</Text>
                {!!f.explanation && <Text style={[styles.p, { marginTop: 4 }]}>{f.explanation}</Text>}
              </View>
            ))}
          </Box>

          <Box title="Notions probables à l’examen">
            {(r.likely_exam_topics || []).slice(0, 40).map((t: string, i: number) => (
              <Text key={i} style={styles.li}>• {t}</Text>
            ))}
          </Box>

          <Box title="Erreurs fréquentes à éviter">
            {(r.common_mistakes || []).slice(0, 40).map((t: string, i: number) => (
              <Text key={i} style={styles.li}>• {t}</Text>
            ))}
          </Box>

          {warnings?.length ? (
            <Box title="Ambiguïtés / avertissements">
              {warnings.slice(0, 80).map((w: string, i: number) => (
                <Text key={i} style={styles.li}>• {w}</Text>
              ))}
            </Box>
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
  warn: { fontSize: 12, fontWeight: '700', color: '#B45309', marginTop: 6 },
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
  p: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  li: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22, marginBottom: 6 },
});

