import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { Colors, Spacing, BorderRadius, Shadows } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { usePremiumFeature } from '@/hooks/usePremiumFeature';
import { apiUpload, apiRequest } from '@/utils/api';
import { countWordsFrText, estimateAiSummaryPriceMru } from '@/utils/aiDocumentPricing';

type Picked = { uri: string; name: string; type: string; size?: number } | null;

export default function AIExerciseImportScreen({ navigation }: any) {
  const { token } = useAuth();
  const { colors: C, isDark } = useTheme();
  const { balanceMru, loading: walletLoading } = usePremiumFeature('ai_exercise_correction', 15_000);
  const [picked, setPicked] = useState<Picked>(null);
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [statementText, setStatementText] = useState('');
  const [loading, setLoading] = useState(false);

  const importPricing = useMemo(() => {
    const empty = {
      chargeMru: null as number | null,
      basis: null as 'pages' | 'words' | 'fallback' | null,
      hint: null as string | null,
      wordCount: null as number | null,
      isPhoto: false,
      pageCount: null as number | null,
    };
    if (mode === 'text') {
      const wc = countWordsFrText(statementText);
      if (wc < 1) return { ...empty, hint: 'Saisis au moins quelques mots pour voir l’estimation.' };
      const p = estimateAiSummaryPriceMru({ pageCount: null, wordCount: wc });
      return { chargeMru: p.priceMru, basis: p.basis, hint: null, wordCount: wc, isPhoto: false, pageCount: null };
    }
    if (!picked) return { ...empty, hint: 'Choisis un fichier pour estimer le coût.' };
    const isImg = picked.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(picked.name);
    const isPdf = picked.type === 'application/pdf' || picked.name.toLowerCase().endsWith('.pdf');
    if (isImg) {
      const p = estimateAiSummaryPriceMru({ pageCount: 1, wordCount: 0 });
      return { chargeMru: p.priceMru, basis: p.basis, hint: null, wordCount: null, isPhoto: true, pageCount: 1 };
    }
    if (isPdf) {
      return {
        ...empty,
        hint: 'Après import, le prix exact dépend du nombre de pages et de mots extraits du PDF (même grille que les résumés IA).',
      };
    }
    return {
      ...empty,
      hint: 'Après import, tarification selon pages & mots extraits (Office → PDF côté serveur).',
    };
  }, [mode, picked, statementText]);

  const canContinue = useMemo(() => {
    if (loading) return false;
    if (mode === 'file') return !!picked;
    return statementText.trim().length >= 10;
  }, [loading, mode, picked, statementText]);

  const pickDocument = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const f = r.assets[0];
    setPicked({
      uri: f.uri,
      name: f.name || 'document',
      type: f.mimeType || 'application/octet-stream',
      size: f.size,
    });
    setMode('file');
  };

  const pickImage = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert('Permission', fromCamera ? "Autorise l'accès à la caméra." : "Autorise l'accès aux photos.");
    }
    const r = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setPicked({ uri: a.uri, name: 'image.jpg', type: 'image/jpeg' });
    setMode('file');
  };

  const createDocument = async () => {
    if (!token) return Alert.alert('Connexion', 'Connecte-toi pour continuer.');
    setLoading(true);
    try {
      if (mode === 'file') {
        if (!picked) throw new Error('Choisis un fichier.');
        const fd = new FormData();
        fd.append('file', { uri: picked.uri, name: picked.name, type: picked.type } as any);
        const data = await apiUpload<{ documentId: string; status: string }>('/ai/exercise-corrections/documents', fd, token);
        navigation.navigate('AIExerciseOptions', { documentId: data.documentId });
      } else {
        const data = await apiRequest<{ documentId: string; status: string }>('/ai/exercise-corrections/documents/text', {
          method: 'POST',
          token,
          body: { statementText: statementText.trim() },
        });
        navigation.navigate('AIExerciseOptions', { documentId: data.documentId });
      }
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : null;
      if (status === 404) {
        Alert.alert(
          'Import échoué',
          "Endpoint introuvable (404). Ton app pointe probablement vers l’API prod qui n’a pas encore la feature.\n\nSolution: configure `EXPO_PUBLIC_API_BASE` vers ton serveur à jour (ex: `http://127.0.0.1:3101/api/v1`) et relance l’app + le backend.",
        );
      } else {
        Alert.alert('Import échoué', e.message);
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
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: C.surface, borderColor: C.border }]}>
            <AppIcon name="arrowBack" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Correction IA</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('AIExerciseHistory')}
            style={[styles.historyBtn, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}
            activeOpacity={0.85}
          >
            <AppIcon name="timeOutline" size={20} color={C.primary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Wallet summary (no recharge card here; recharge is centralized in BillingHub) */}
          <View style={styles.walletCard}>
            <View style={styles.walletRow}>
              <Text style={styles.walletTitle}>Crédits correction IA</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('BillingHub')}
                activeOpacity={0.85}
                style={styles.walletCta}
              >
                <Text style={styles.walletCtaText}>Gérer</Text>
                <AppIcon name="chevronForward" size={16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.walletBalance}>
              {walletLoading ? '…' : `${balanceMru ?? 0} MRU`}
            </Text>
            <Text style={styles.walletHint}>
              {importPricing.hint
                ? importPricing.hint
                : importPricing.chargeMru != null
                  ? `Coût estimé: ${importPricing.chargeMru} MRU`
                  : 'Choisis un fichier pour estimer le coût.'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Importer l’exercice</Text>
            <Text style={styles.cardSub}>Photo/scan, PDF, ou texte copié-collé.</Text>

            <Text style={styles.h}>Mode</Text>
            <View style={styles.chipWrap}>
              <Chip active={mode === 'file'} label="Photo / PDF" onPress={() => setMode('file')} />
              <Chip active={mode === 'text'} label="Texte" onPress={() => setMode('text')} />
            </View>

            {mode === 'file' ? (
              <>
                <View style={{ height: 8 }} />
                <TouchableOpacity style={styles.actionBtn} onPress={() => pickImage(true)} disabled={loading}>
                  <AppIcon name="cameraOutline" size={20} color="Colors.primary" />
                  <Text style={styles.actionText}>Prendre une photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => pickImage(false)} disabled={loading}>
                  <AppIcon name="imagesOutline" size={20} color="Colors.primary" />
                  <Text style={styles.actionText}>Choisir une image / scan</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={pickDocument} disabled={loading}>
                  <AppIcon name="documentAttach" size={20} color="Colors.primary" />
                  <Text style={styles.actionText}>Choisir un PDF</Text>
                </TouchableOpacity>

                {picked && (
                  <View style={styles.filePill}>
                    <AppIcon name="checkmarkCircle" size={18} color="#16A34A" />
                    <Text style={styles.fileText} numberOfLines={1}>
                      {picked.name}
                    </Text>
                    <TouchableOpacity onPress={() => setPicked(null)} disabled={loading}>
                      <AppIcon name="closeCircle" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={styles.h}>Énoncé</Text>
                <TextInput
                  style={styles.textarea}
                  value={statementText}
                  onChangeText={setStatementText}
                  placeholder="Colle ici l’énoncé de l’exercice…"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  maxLength={8000}
                />
                <Text style={styles.hint}>Astuce: si tu as déjà ta réponse, tu pourras la coller à l’étape suivante.</Text>
              </>
            )}

            <TouchableOpacity style={[styles.primaryBtn, !canContinue && { opacity: 0.6 }]} onPress={createDocument} disabled={!canContinue}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <AppIcon name="sparkles" size={18} color="#fff" />
                  <Text style={styles.primaryText}>Continuer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 19, fontWeight: '900' },
  backBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.xs,
  },
  historyBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.xs,
  },
  content: { flexGrow: 1, padding: Spacing.lg, paddingBottom: 140 },
  walletCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 12,
    ...Shadows.sm,
  },
  walletRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletTitle: { fontSize: 14, fontWeight: '900', color: Colors.textPrimary },
  walletCta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walletCtaText: { fontSize: 13, fontWeight: '900', color: Colors.primary },
  walletBalance: { fontSize: 22, fontWeight: '900', color: Colors.primary, marginTop: 8 },
  walletHint: { fontSize: 12, color: Colors.textMuted, marginTop: 6, lineHeight: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadows.sm,
  },
  cardTitle: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  cardSub: { fontSize: 13, color: Colors.textMuted, marginTop: 6, lineHeight: 18 },
  h: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    marginTop: 14,
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#EDE9FE', borderColor: Colors.primary },
  chipText: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  chipTextActive: { color: Colors.primary },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    marginTop: 10,
  },
  actionText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  filePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  fileText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#166534' },
  textarea: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 160,
    fontSize: 14,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 16, marginTop: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 18,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

