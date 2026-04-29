/**
 * VoiceNoteDetailScreen — Whisper Studio : Transcript + IA 🤖
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Modal, Share } from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth }          from '../../context/AuthContext';
import { useTheme }         from '../../context/ThemeContext';
import { useLanguage }      from '../../context/LanguageContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import {
  RootStackParamList,
  VoiceNote,
  VoiceNoteEnhanceMode,
  EnhancedTranscript,
  TranscriptVersion,
  TranscriptConfidenceHints,
} from '../../types';
import { API_BASE } from '../../utils/api';
import { notifyWalletSpent } from '../../utils/walletUtils';
import { computePaygChargeMru } from '@/utils/paygCharge';
import { Colors, BorderRadius, Gradients, Shadows, Spacing } from '../../theme';
import { usePremiumFeature } from '../../hooks/usePremiumFeature';
import PremiumGate from '../../components/common/PremiumGate';
import { safeBack } from '../../utils/safeBack';

type Route = RouteProp<RootStackParamList, 'VoiceNoteDetail'>;
type Nav   = StackNavigationProp<RootStackParamList, 'VoiceNoteDetail'>;

const WHISPER_COLOR = '#7C3AED';

// ─── Config des actions IA ────────────────────────────────────────────────────

interface ActionConfig {
  mode:     VoiceNoteEnhanceMode;
  icon:     AppIconName;
  labelFr:  string;
  labelAr:  string;
  descFr:   string;
  descAr:   string;
  gradient: [string, string];
}

const AI_ACTIONS: ActionConfig[] = [
  {
    mode: 'summary',
    icon: 'listOutline',
    labelFr: 'Résumé',   labelAr: 'ملخص',
    descFr:  'Points clés structurés',
    descAr:  'النقاط الرئيسية بالعربية',
    gradient: ['#0EA5E9', '#0369A1'],
  },
  {
    mode: 'rewrite',
    icon: 'createOutline',
    labelFr: 'Réécriture',      labelAr: 'إعادة صياغة',
    descFr:  'Notes propres + structurées', descAr: 'ملاحظات منظمة ومرتبة',
    gradient: ['#10B981', '#047857'],
  },
  {
    mode: 'course',
    icon: 'schoolOutline',
    labelFr: 'Cours IA',        labelAr: 'درس ذكاء اصطناعي',
    descFr:  'Cours complet enrichi par Wikipedia',
    descAr:  'درس كامل مُعزَّز من ويكيبيديا',
    gradient: ['#F59E0B', '#B45309'],
  },
  {
    mode: 'flashcards',
    icon: 'albumsOutline',
    labelFr: 'Flashcards', labelAr: 'بطاقات',
    descFr:  '8-15 Q/R pour réviser le cours',
    descAr:  '8-15 سؤال وجواب للمراجعة',
    gradient: ['#8B5CF6', '#6D28D9'],
  },
];

// Important UX: ne jamais exposer les modèles utilisés. Le serveur choisit automatiquement.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(s?: number): string {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── CourseRenderer — renders markdown-like course sections ──────────────────

function CourseRenderer({ text, C, isAr }: { text: string; C: typeof Colors; isAr: boolean }) {
  const lines = text.split('\n');

  return (
    <View>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={i} style={{ height: 10 }} />;

        if (trimmed.startsWith('## ')) {
          return (
            <View key={i} style={{
              marginTop: 20, marginBottom: 8,
              borderLeftWidth: 4, borderLeftColor: '#F59E0B',
              paddingLeft: 12,
            }}>
              <Text style={{
                fontSize: 18, fontWeight: '800', color: C.textPrimary,
                textAlign: isAr ? 'right' : 'left',
              }}>
                {trimmed.slice(3)}
              </Text>
            </View>
          );
        }
        if (trimmed.startsWith('### ')) {
          return (
            <Text key={i} style={{
              fontSize: 15, fontWeight: '700', color: '#F59E0B',
              marginTop: 14, marginBottom: 4,
              textAlign: isAr ? 'right' : 'left',
            }}>
              {trimmed.slice(4)}
            </Text>
          );
        }
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
          return (
            <Text key={i} style={{
              fontSize: 14, fontWeight: '700', color: C.textPrimary,
              marginTop: 8, textAlign: isAr ? 'right' : 'left',
            }}>
              {trimmed.slice(2, -2)}
            </Text>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <View key={i} style={{
              flexDirection: isAr ? 'row-reverse' : 'row',
              alignItems: 'flex-start', marginTop: 4,
            }}>
              <Text style={{ color: '#F59E0B', fontSize: 15, marginHorizontal: 8, marginTop: 1 }}>•</Text>
              <Text style={{ flex: 1, fontSize: 14, color: C.textPrimary, lineHeight: 22,
                textAlign: isAr ? 'right' : 'left' }}>
                {trimmed.slice(2)}
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} selectable style={{
            fontSize: 14, color: C.textPrimary, lineHeight: 24,
            marginTop: 4, textAlign: isAr ? 'right' : 'left',
          }}>
            {trimmed}
          </Text>
        );
      })}
    </View>
  );
}

// ─── DiffText — renders text with {{word}} markers as underlined violet ───────

function DiffText({ text, C, isAr }: { text: string; C: typeof Colors; isAr: boolean }) {
  // Split on {{...}} tokens
  const parts = text.split(/(\{\{[^}]+\}\})/g);

  // Group into lines (split on \n first)
  const lines = text.split('\n');

  return (
    <View>
      {lines.map((line, li) => {
        const tokens = line.split(/(\{\{[^}]+\}\})/g);
        return (
          <Text
            key={li}
            selectable
            style={{
              fontSize: 15,
              color: C.textPrimary,
              lineHeight: 26,
              textAlign: isAr ? 'right' : 'left',
              marginBottom: 4,
              writingDirection: isAr ? 'rtl' : 'ltr',
            }}
          >
            {tokens.map((tok, ti) => {
              if (tok.startsWith('{{') && tok.endsWith('}}')) {
                const word = tok.slice(2, -2);
                return (
                  <Text
                    key={ti}
                    style={{
                      color: WHISPER_COLOR,
                      textDecorationLine: 'underline',
                      fontWeight: '600',
                    }}
                  >
                    {word}
                  </Text>
                );
              }
              return <Text key={ti}>{tok}</Text>;
            })}
          </Text>
        );
      })}
    </View>
  );
}

// ─── Écran ────────────────────────────────────────────────────────────────────

export default function VoiceNoteDetailScreen() {
  const navigation    = useNavigation<Nav>();
  const { params: { note: initialNote } } = useRoute<Route>();
  const { token }     = useAuth();
  const { colors: C, isDark } = useTheme();
  const { lang, t }  = useLanguage();
  const { fontSize }  = useAccessibility();
  const isAr          = lang === 'ar';
  const styles        = useMemo(() => makeStyles(C), [C]);
  const insets        = useSafeAreaInsets();
  const transcriptScrollRef = useRef<ScrollView>(null);
  const [mainTab, setMainTab] = useState<'transcript' | 'ai'>('transcript');

  const { hasAccess: hasWhisperAccess, loading: whisperLoading, balanceMru: whisperBalance } = usePremiumFeature('whisper_studio');

  const [note, setNote]                   = useState<VoiceNote>(initialNote);
  const [transcript, setTranscript]       = useState(initialNote.transcript ?? '');
  const [isEditingTranscript, setIsEditing] = useState(false);
  const [isSaving, setIsSaving]           = useState(false);

  /** Heuristiques « passages à vérifier » — GET /voice-notes/:id/confidence-hints */
  const [confidenceHints, setConfidenceHints] = useState<TranscriptConfidenceHints | null>(null);
  const [confidenceLoading, setConfidenceLoading] = useState(false);

  useEffect(() => {
    if (isEditingTranscript) setMainTab('transcript');
  }, [isEditingTranscript]);

  // ── Fetch full note on mount (list only returns transcript_preview) ────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/voice-notes/${initialNote.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: VoiceNote | null) => {
        if (!data) return;
        setNote(data);
        setTranscript(data.transcript ?? '');
      })
      .catch(() => {});
  }, [initialNote.id, token]);

  // ── Polling si la note est en "processing" — recharge jusqu'à "done"/"failed" ──
  useEffect(() => {
    if (note.status !== 'processing') return;
    const interval = setInterval(async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/voice-notes/${initialNote.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: VoiceNote = await res.json();
        setNote(data);
        setTranscript(data.transcript ?? '');
        if (data.status !== 'processing') clearInterval(interval);
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [note.status, initialNote.id, token]);

  // ── Heuristiques fiabilité transcription (après transcription terminée) ───
  useEffect(() => {
    if (!token || note.status !== 'done' || !transcript.trim()) {
      setConfidenceHints(null);
      return;
    }
    let cancelled = false;
    setConfidenceLoading(true);
    const langHint = note.language ?? (isAr ? 'ar' : 'fr');
    const q = `?language=${langHint}`;
    fetch(`${API_BASE}/voice-notes/${note.id}/confidence-hints${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then((data: TranscriptConfidenceHints | null) => {
        if (!cancelled && data) setConfidenceHints(data);
        else if (!cancelled) setConfidenceHints(null);
      })
      .catch(() => {
        if (!cancelled) setConfidenceHints(null);
      })
      .finally(() => {
        if (!cancelled) setConfidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, note.id, note.status, note.language, transcript, isAr]);

  // ── Audio playback ────────────────────────────────────────────────────────
  const soundRef                          = useRef<Audio.Sound | null>(null);
  const barWidthRef                       = useRef(0);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [audioPos, setAudioPos]           = useState(0);   // ms
  const [audioDur, setAudioDur]           = useState(0);   // ms
  const [audioLoading, setAudioLoading]   = useState(false);
  const [audioErr, setAudioErr]           = useState<string | null>(null);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const loadAndPlay = async () => {
    if (!token) return;
    setAudioLoading(true);
    setAudioErr(null);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${API_BASE}/voice-notes/${note.id}/audio?t=${token}` },
        { shouldPlay: true, progressUpdateIntervalMillis: 300 },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            setAudioPos(status.positionMillis);
            setAudioDur(status.durationMillis ?? 0);
            setIsPlaying(status.isPlaying);
            if (status.didJustFinish) {
              setIsPlaying(false);
              setAudioPos(0);
            }
          }
        },
      );
      soundRef.current = sound;
    } catch (e: any) {
      setAudioErr(e.message ?? 'Playback failed');
    } finally {
      setAudioLoading(false);
    }
  };

  const togglePlay = async () => {
    if (!soundRef.current) { await loadAndPlay(); return; }
    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      if (audioDur > 0 && audioPos >= audioDur) {
        await soundRef.current.setPositionAsync(0);
      }
      await soundRef.current.playAsync();
    }
  };

  const seekAudio = async (x: number) => {
    if (!soundRef.current || audioDur === 0 || barWidthRef.current === 0) return;
    const ratio = Math.max(0, Math.min(1, x / barWidthRef.current));
    await soundRef.current.setPositionAsync(Math.floor(ratio * audioDur));
  };

  /** Saut audio approximatif (ex. minute OpenAI) — charge le son si besoin. */
  const playAudioAtApproxSec = async (sec: number) => {
    const ms = Math.max(0, Math.floor(sec * 1000));
    try {
      if (!soundRef.current) await loadAndPlay();
      const s = soundRef.current;
      if (!s) return;
      await s.setPositionAsync(ms);
      await s.playAsync();
    } catch {
      /* ignore */
    }
  };

  // ── Completed enhance modes (track all 3 independently) ───────────────────
  const initModes = (): Set<VoiceNoteEnhanceMode> => {
    const s = new Set<VoiceNoteEnhanceMode>();
    if (initialNote.deck_id) s.add('flashcards');
    if (initialNote.ai_course) s.add('course');
    if (initialNote.enhance_mode && initialNote.enhance_mode !== 'flashcards')
      s.add(initialNote.enhance_mode);
    return s;
  };
  const [completedModes, setCompletedModes] = useState<Set<VoiceNoteEnhanceMode>>(initModes);

  // ── Speaker filter (diarization) ─────────────────────────────────────────
  const [filteredSpeaker, setFilteredSpeaker] = useState<string | null>(null);

  // Detect speakers from transcript — returns ['Intervenant 1', 'Intervenant 2', ...]
  const detectedSpeakers = useMemo(() => {
    const matches = transcript.match(/\[Intervenant [^\]]+\]/g);
    if (!matches) return [];
    return [...new Set(matches)];
  }, [transcript]);

  // Filtered view: keep only selected speaker's lines
  const displayTranscript = useMemo(() => {
    if (!filteredSpeaker || detectedSpeakers.length === 0) return transcript;
    const lines = transcript.split('\n');
    return lines
      .filter(line => line.startsWith(filteredSpeaker))
      .map(line => line.replace(`${filteredSpeaker} `, '').trim())
      .join('\n\n');
  }, [transcript, filteredSpeaker, detectedSpeakers]);

  // ── État IA ───────────────────────────────────────────────────────────────
  const [activeAction, setActiveAction]   = useState<VoiceNoteEnhanceMode | null>(null);
  const [enhanceLoading, setEnhanceLoading] = useState(false);
  // Which LLM to use for AI enhancement actions. Must match VALID_ENHANCEMENT_MODELS
  // on the server (api/src/routes/voiceNotes.ts). Default gpt-4o-mini for balance
  // of quality/cost; user can pick gpt-4o for best quality, or groq/gemini for free/cheap.
  const [selectedModel, setSelectedModel] = useState<
    'gpt-4o' | 'gpt-4o-mini' | 'groq-llama' | 'gemini-flash'
  >('gpt-4o-mini');
  // Important UX: pas de sélection de modèle côté app. Le serveur optimise automatiquement.
  const [resultText, setResultText]           = useState<string | null>(null);
  const [resultEnhanced, setResultEnhanced]   = useState<EnhancedTranscript | null>(null);
  const [resultCards, setResultCards]         = useState<{ front: string; back: string }[] | null>(null);
  const [resultMode, setResultMode]           = useState<VoiceNoteEnhanceMode | null>(null);
  const [resultDeckId, setResultDeckId]       = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [transcriptTab, setTranscriptTab]     = useState<'raw' | 'clean'>('raw');

  // ── Sauvegarder la transcription éditée ──────────────────────────────────
  const saveTranscript = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/voice-notes/${note.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(t('vn.error'), e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Supprimer cet enregistrement (retire de l’archive) ───────────────────
  const deleteVoiceNote = () => {
    Alert.alert(
      t('vn.delete_title'),
      `${note.title || t('vn.transcript')} ?`,
      [
        { text: t('vn.delete_cancel'), style: 'cancel' },
        {
          text: t('vn.delete_confirm'),
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              const res = await fetch(`${API_BASE}/voice-notes/${note.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              safeBack(navigation);
            } catch {
              Alert.alert(t('vn.error'), t('vn.cannot_delete'));
            }
          },
        },
      ],
    );
  };

  // ── Action IA ─────────────────────────────────────────────────────────────
  const handleEnhance = async (mode: VoiceNoteEnhanceMode) => {
    if (!token || !transcript) return;

    // Pause audio before opening modal (iOS pageSheet interrupts audio session)
    if (isPlaying) {
      try { await soundRef.current?.pauseAsync(); } catch {}
      setIsPlaying(false);
    }

    // ── Course mode — uses separate endpoint ──────────────────────────────
    if (mode === 'course') {
      // If already generated, show directly
      if (note.ai_course) {
        setResultText(note.ai_course);
        setResultMode('course');
        setShowResultModal(true);
        return;
      }

      setActiveAction('course');
      setEnhanceLoading(true);
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const res = await fetch(`${API_BASE}/voice-notes/${note.id}/generate-course`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: note.subject ?? '' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setNote(prev => ({ ...prev, ai_course: data.course }));
        setResultText(data.course);
        setResultMode('course');
        setCompletedModes(prev => new Set(prev).add('course'));
        setShowResultModal(true);
      } catch (e: any) {
        Alert.alert('Erreur', e.message);
      } finally {
        setEnhanceLoading(false);
        setActiveAction(null);
      }
      return;
    }

    // Si déjà calculé et stocké, afficher directement
    if (note.enhance_mode === mode) {
      if (mode === 'flashcards' && note.deck_id) {
        Alert.alert(
          t('vn.flashcards_ready_title'),
          t('vn.flashcards_ready_msg'),
          [
            { text: t('vn.delete_cancel'), style: 'cancel' },
            { text: t('vn.open'), onPress: () => navigation.navigate('Main') },
          ],
        );
        return;
      }
      if (note.clean_transcript || note.enhanced_text) {
        setResultText(note.clean_transcript ?? note.enhanced_text ?? null);
        setResultEnhanced(
          note.clean_transcript
            ? {
                clean_transcript:  note.clean_transcript,
                summary:           note.summary            ?? '',
                action_items:      note.action_items        ?? [],
                key_topics:        note.key_topics          ?? [],
                unclear_segments:  note.unclear_segments    ?? [],
              }
            : null,
        );
        setResultMode(mode);
        setShowResultModal(true);
        return;
      }
    }

    setActiveAction(mode);
    setEnhanceLoading(true);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await fetch(`${API_BASE}/voice-notes/${note.id}/enhance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode,
          subject: note.subject ?? '',
          enhancement_model: selectedModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Notifier le débit PAYG (exactement selon la grille de prix affichée)
      // - flashcards → ai_flashcards
      // - course     → ai_course
      // - autres actions Whisper (summary/rewrite) restent sur whisper_studio
      const paygFeatureKey =
        mode === 'flashcards' ? 'ai_flashcards'
        : mode === 'course' ? 'ai_course'
        : 'whisper_studio';

      const chargeMru = computePaygChargeMru({
        featureKey: paygFeatureKey as any,
        uses: 1,
      });
      if (chargeMru > 0) notifyWalletSpent(paygFeatureKey, chargeMru);

      setResultMode(mode);
      setCompletedModes(prev => new Set(prev).add(mode));

      if (mode === 'flashcards' && data.cards) {
        setResultCards(data.cards);
        setResultDeckId(data.deck?.id ?? null);
        setNote(prev => ({ ...prev, enhance_mode: 'flashcards', deck_id: data.deck?.id }));
      } else if (data.enhanced) {
        const e: EnhancedTranscript = data.enhanced;
        setResultEnhanced(e);
        setResultText(e.clean_transcript);
        setNote(prev => ({
          ...prev,
          enhance_mode:     mode,
          enhanced_text:    e.clean_transcript,
          clean_transcript: e.clean_transcript,
          summary:          e.summary,
          action_items:     e.action_items,
          key_topics:       e.key_topics,
          unclear_segments: e.unclear_segments,
        }));
      } else if (data.text) {
        // legacy fallback
        setResultText(data.text);
        setNote(prev => ({ ...prev, enhance_mode: mode, enhanced_text: data.text }));
      }

      setShowResultModal(true);
    } catch (e: any) {
    } finally {
      setEnhanceLoading(false);
      setActiveAction(null);
    }
  };

  // ── Partager le transcript ─────────────────────────────────────────────────
  const shareTranscript = async () => {
    if (!transcript) return;
    try {
      await Share.share({
        title: note.title || 'Transcript — Whisper Studio',
        message: transcript,
      });
    } catch {}
  };

  // ── Retranscription avec diff + historique des versions ──────────────────
  const [retranscribeLoading, setRetranscribeLoading] = useState(false);
  const [diffedTranscript, setDiffedTranscript]       = useState<string | null>(null);
  const [showDiffModal, setShowDiffModal]             = useState(false);
  const [transcriptVersions, setTranscriptVersions]  = useState<TranscriptVersion[]>(
    note.transcript_versions ?? [],
  );
  const [showHistoryModal, setShowHistoryModal]       = useState(false);
  const [restoreLoading, setRestoreLoading]           = useState(false);

  const handleRetranscribe = async () => {
    if (!token || !note.audio_filename) {
      Alert.alert(
        isAr ? 'الملف غير متاح' : 'Fichier audio introuvable',
        isAr ? 'الملف الصوتي غير محفوظ لهذه الملاحظة' : "Le fichier audio n'est plus disponible pour cette note",
      );
      return;
    }
    Alert.alert(
      isAr ? 'إعادة النسخ' : 'Retranscrire l\'audio',
      isAr
        ? 'سيُعاد إرسال الملف الصوتي إلى Whisper. الكلمات المُعدَّلة ستكون مُسطَّرة باللون البنفسجي. هل تريد المتابعة؟'
        : 'Le fichier audio sera renvoyé à Whisper. Les mots modifiés seront soulignés en violet. Continuer ?',
      [
        { text: isAr ? 'إلغاء' : 'Annuler', style: 'cancel' },
        {
          text: isAr ? 'نعم، أعد النسخ' : 'Oui, retranscrire',
          onPress: async () => {
            setRetranscribeLoading(true);
            try {
              const res = await fetch(`${API_BASE}/voice-notes/${note.id}/retranscribe`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: note.language ?? undefined }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
              setTranscript(data.transcript);
              setNote(prev => ({ ...prev, transcript: data.transcript, transcript_versions: data.versions }));
              setTranscriptVersions(data.versions ?? []);
              setDiffedTranscript(data.diffed);
              setShowDiffModal(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e: any) {
              Alert.alert(isAr ? 'خطأ' : 'Erreur', e.message);
            } finally {
              setRetranscribeLoading(false);
            }
          },
        },
      ],
    );
  };

  // Restore the most recent saved version (= reject the latest retranscription)
  const handleRejectRetranscribe = async () => {
    if (!token || transcriptVersions.length === 0) return;
    const lastIdx = transcriptVersions.length - 1;
    setRestoreLoading(true);
    try {
      const res = await fetch(`${API_BASE}/voice-notes/${note.id}/restore-version`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_index: lastIdx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTranscript(data.transcript);
      setNote(prev => ({ ...prev, transcript: data.transcript, transcript_versions: data.versions }));
      setTranscriptVersions(data.versions ?? []);
      setShowDiffModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e: any) {
      Alert.alert(isAr ? 'خطأ' : 'Erreur', e.message);
    } finally {
      setRestoreLoading(false);
    }
  };

  // Restore any version from history
  const handleRestoreVersion = async (versionIndex: number) => {
    if (!token) return;
    setRestoreLoading(true);
    try {
      const res = await fetch(`${API_BASE}/voice-notes/${note.id}/restore-version`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_index: versionIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTranscript(data.transcript);
      setNote(prev => ({ ...prev, transcript: data.transcript, transcript_versions: data.versions }));
      setTranscriptVersions(data.versions ?? []);
      setShowHistoryModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(isAr ? 'خطأ' : 'Erreur', e.message);
    } finally {
      setRestoreLoading(false);
    }
  };

  // ── Helpers display ──────────────────────────────────────────────────────
  const audioPct = audioDur > 0 ? audioPos / audioDur : 0;
  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // ── Fermer le modal résultat ───────────────────────────────────────────────
  const closeModal = async () => {
    setShowResultModal(false);
    setResultText(null);
    setResultEnhanced(null);
    setResultCards(null);
    setResultMode(null);
    // iOS pageSheet interrupts the audio session — unload so next tap reloads cleanly
    try {
      await soundRef.current?.unloadAsync();
    } catch {}
    soundRef.current = null;
    setIsPlaying(false);
    setAudioPos(0);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  };

  const bottomPad = Math.max(insets.bottom, 16) + 48;
  const showTranscriptScrollFab =
    mainTab === 'transcript' &&
    !isEditingTranscript &&
    note.status === 'done' &&
    (displayTranscript || '').length > 900;

  const transcriptWordCount = useMemo(
    () => (transcript.trim() ? transcript.split(/\s+/).filter(Boolean).length : 0),
    [transcript],
  );
  const transcriptWordBadge =
    transcriptWordCount > 9999 ? '9999+' : String(transcriptWordCount);

  const selectMainTab = useCallback((tab: 'transcript' | 'ai') => {
    if (tab === mainTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMainTab(tab);
  }, [mainTab]);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <PremiumGate
      featureKey="whisper_studio"
      loading={whisperLoading}
      hasAccess={hasWhisperAccess}
      balanceMru={whisperBalance}
      navigation={navigation}
      lang={lang}
    >
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={isDark ? ['#1E1040', '#2A1455', '#3B0764'] : [...Gradients.brand]}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => safeBack(navigation)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.headerBackBtn}
          >
            <AppIcon name="arrowBack" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: Spacing.sm, minWidth: 0 }}>
            <Text style={styles.headerTitleOnGradient} numberOfLines={1}>
              {note.title || t('vn.transcript')}
            </Text>
            <View style={styles.headerMetaRow}>
              {note.subject ? (
                <View style={styles.subjectPillOnGradient}>
                  <Text style={styles.subjectPillOnGradientText}>{note.subject}</Text>
                </View>
              ) : null}
              {note.duration_s ? (
                <View style={styles.metaPillOnGradient}>
                  <AppIcon name="timeOutline" size={11} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.metaPillOnGradientText}>{formatDuration(note.duration_s)}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.headerActions}>
            {transcriptVersions.length > 0 && (
              <TouchableOpacity
                style={styles.headerIconBtnLight}
                onPress={() => setShowHistoryModal(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={{ position: 'relative' }}>
                  <AppIcon name="timeOutline" size={20} color="#FFFFFF" />
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>
                      {transcriptVersions.length}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            {note.status === 'done' && !!note.audio_filename && (
              <TouchableOpacity
                style={styles.headerIconBtnLight}
                onPress={handleRetranscribe}
                disabled={retranscribeLoading}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {retranscribeLoading
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <AppIcon name="refreshCircleOutline" size={22} color="#FFFFFF" />}
              </TouchableOpacity>
            )}
            {!!transcript && (
              <TouchableOpacity
                style={styles.headerIconBtnLight}
                onPress={shareTranscript}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <AppIcon name="shareOutline" size={21} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerIconBtnDanger}
              onPress={deleteVoiceNote}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={isAr ? 'حذف التسجيل' : 'Supprimer l’enregistrement'}
            >
              <AppIcon name="trashOutline" size={21} color="#FECACA" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {/* ── Lecteur audio (fixe, hors scroll principal) ── */}
        {note.status === 'done' && (
          <View style={styles.playerStrip}>
          <LinearGradient
            colors={isDark ? ['#1E1040', '#130A2A'] : ['#EDE9FE', '#F5F3FF', '#FAF9FF']}
            style={styles.playerCard}
          >
            {/* Titre + durée */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <LinearGradient colors={[...Gradients.violet]} style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', ...Shadows.brand }}>
                <AppIcon name="musicalNotes" size={15} color="#fff" />
              </LinearGradient>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.textPrimary, flex: 1 }} numberOfLines={1}>
                {note.title || t('vn.transcript')}
              </Text>
              {!!(audioDur > 0 || note.duration_s) && (
                <Text style={{ fontSize: 11, color: C.textMuted }}>
                  {audioDur > 0 ? fmtMs(audioDur) : formatDuration(note.duration_s!)}
                </Text>
              )}
            </View>

            {/* Progress bar */}
            <TouchableOpacity
              activeOpacity={0.9}
              onLayout={e => { barWidthRef.current = e.nativeEvent.layout.width; }}
              onPress={e => seekAudio(e.nativeEvent.locationX)}
              style={{ marginBottom: 6 }}
            >
              <View style={styles.progressTrack}>
                <LinearGradient
                  colors={['#A78BFA', '#7C3AED']}
                  style={[styles.progressFill, { width: `${Math.round(audioPct * 100)}%` }]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                />
                {audioDur > 0 && (
                  <View style={[styles.progressThumb, { left: `${Math.round(audioPct * 100)}%` as any }]} />
                )}
              </View>
            </TouchableOpacity>

            {/* Time + controls */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.timeText}>{fmtMs(audioPos)}</Text>
              <TouchableOpacity
                style={styles.playBtn}
                onPress={togglePlay}
                disabled={audioLoading}
                activeOpacity={0.8}
              >
                <LinearGradient colors={[...Gradients.violet]} style={styles.playBtnGrad}>
                  {audioLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <AppIcon name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
                  }
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.timeText}>
                {audioDur > 0 ? fmtMs(audioDur) : note.duration_s ? formatDuration(note.duration_s) : '--:--'}
              </Text>
            </View>

            {audioErr ? (
              <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 8, textAlign: 'center' }}>
                ⚠️ {audioErr}
              </Text>
            ) : null}
          </LinearGradient>
          </View>
        )}

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, mainTab === 'transcript' && styles.tabItemActive]}
            onPress={() => selectMainTab('transcript')}
            activeOpacity={0.85}
          >
            <AppIcon name="documentText"
              size={17}
              color={mainTab === 'transcript' ? '#FFFFFF' : C.textMuted}
            />
            <Text style={[styles.tabItemLabel, mainTab === 'transcript' && styles.tabItemLabelActive]}>
              {isAr ? 'النص' : 'Texte'}
            </Text>
            {note.status === 'done' ? (
              <View style={[styles.tabBadge, mainTab === 'transcript' && styles.tabBadgeOnActive]}>
                <Text style={[styles.tabBadgeText, mainTab === 'transcript' && styles.tabBadgeTextOnActive]}>
                  {transcriptWordBadge}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, mainTab === 'ai' && styles.tabItemActive, note.status === 'processing' && { opacity: 0.55 }]}
            onPress={() => selectMainTab('ai')}
            activeOpacity={0.85}
          >
            <AppIcon name='sparkles'
              size={17}
              color={mainTab === 'ai' ? '#FFFFFF' : C.textMuted}
            />
            <Text style={[styles.tabItemLabel, mainTab === 'ai' && styles.tabItemLabelActive]}>
              {isAr ? 'الذكاء الاصطناعي' : 'Studio IA'}
            </Text>
            {completedModes.size > 0 ? (
              <View style={[styles.tabBadge, mainTab === 'ai' && styles.tabBadgeOnActive]}>
                <Text style={[styles.tabBadgeText, mainTab === 'ai' && styles.tabBadgeTextOnActive]}>
                  {completedModes.size}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.tabContentWrap}>
          <ScrollView
            ref={transcriptScrollRef}
            style={[styles.tabScroll, { opacity: mainTab === 'transcript' ? 1 : 0 }]}
            pointerEvents={mainTab === 'transcript' ? 'auto' : 'none'}
            contentContainerStyle={{ paddingBottom: bottomPad, paddingTop: 4 }}
            showsVerticalScrollIndicator={mainTab === 'transcript'}
            keyboardShouldPersistTaps="handled"
          >
        <View style={[styles.transcriptShell, { marginBottom: 0, marginHorizontal: Spacing.base }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.transcriptHeaderLeft}>
              <AppIcon name="documentTextOutline" size={18} color={WHISPER_COLOR} />
              <Text style={styles.sectionLabel}>
                {t('vn.transcript')}
              </Text>
            </View>
            {isEditingTranscript ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: C.surfaceVariant }]}
                  onPress={() => { setTranscript(note.transcript ?? ''); setIsEditing(false); }}
                >
                  <Text style={{ color: C.textSecondary, fontSize: 13 }}>
                    {t('vn.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: WHISPER_COLOR }]}
                  onPress={saveTranscript}
                  disabled={isSaving}
                >
                  {isSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                        {t('vn.save')}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: C.surfaceVariant }]}
                onPress={() => setIsEditing(true)}
              >
                <AppIcon name="createOutline" size={13} color={C.textSecondary} />
                <Text style={{ color: C.textSecondary, fontSize: 13, marginLeft: 4 }}>
                  {t('vn.edit')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Speaker filter chips — only shown when diarization detected */}
          {detectedSpeakers.length > 1 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 6,
                fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {isAr ? 'فلتر حسب المتحدث' : 'Filtrer par intervenant'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, flexDirection: 'row' }}>
                <TouchableOpacity
                  style={[
                    styles.speakerChip,
                    !filteredSpeaker && styles.speakerChipActive,
                  ]}
                  onPress={() => setFilteredSpeaker(null)}
                >
                  <Text style={[styles.speakerChipText, !filteredSpeaker && styles.speakerChipTextActive]}>
                    {isAr ? 'الكل' : 'Tous'}
                  </Text>
                </TouchableOpacity>
                {detectedSpeakers.map((sp, i) => (
                  <TouchableOpacity
                    key={sp}
                    style={[
                      styles.speakerChip,
                      filteredSpeaker === sp && styles.speakerChipActive,
                    ]}
                    onPress={() => setFilteredSpeaker(filteredSpeaker === sp ? null : sp)}
                  >
                    <Text style={[styles.speakerChipText, filteredSpeaker === sp && styles.speakerChipTextActive]}>
                      {isAr ? `متحدث ${i + 1}` : sp.replace('[', '').replace(']', '')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {filteredSpeaker && (
                <TouchableOpacity
                  style={styles.saveFilterBtn}
                  onPress={() => {
                    setTranscript(displayTranscript);
                    setFilteredSpeaker(null);
                    Alert.alert(
                      isAr ? 'تم الحفظ' : 'Sauvegardé',
                      isAr ? 'تم حفظ نص المتحدث المختار فقط' : 'Seul le texte de cet intervenant a été conservé.',
                    );
                  }}
                >
                  <AppIcon name="checkmarkCircleOutline" size={14} color={WHISPER_COLOR} />
                  <Text style={styles.saveFilterText}>
                    {isAr ? 'حفظ نص هذا المتحدث فقط' : 'Garder uniquement cet intervenant'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {isEditingTranscript ? (
            <TextInput
              style={styles.transcriptEditor}
              value={transcript}
              onChangeText={setTranscript}
              multiline
              textAlignVertical="top"
              autoFocus
            />
          ) : note.status === 'processing' ? (
            <View style={[styles.transcriptBox, { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 12 }]}>
              <ActivityIndicator size="large" color={WHISPER_COLOR} />
              <Text style={[styles.transcriptText, { color: WHISPER_COLOR, fontWeight: '600', textAlign: 'center' }]}>
                {isAr ? 'جارٍ النسخ… قد يستغرق عدة دقائق' : 'Transcription en cours… quelques minutes'}
              </Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
                {isAr ? 'ستظهر النتيجة تلقائياً عند الانتهاء' : 'Le résultat s\'affichera automatiquement'}
              </Text>
            </View>
          ) : (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptText} selectable>
                {displayTranscript || t('vn.no_transcript')}
              </Text>
            </View>
          )}

          <Text style={styles.transcriptMeta}>
            {transcript.split(' ').filter(Boolean).length} {t('vn.words')}
            {' · '}{formatDate(note.created_at)}
          </Text>

          {!isEditingTranscript && note.status === 'done' && (
            <View
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: BorderRadius.md,
                backgroundColor: isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.08)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.25)',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.textPrimary, marginBottom: 6 }}>
                {t('vn.confidence_title')}
              </Text>
              {confidenceLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={WHISPER_COLOR} />
                  <Text style={{ fontSize: 12, color: C.textMuted }}>{t('vn.confidence_loading')}</Text>
                </View>
              ) : confidenceHints && confidenceHints.spans.length > 0 ? (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontSize: 11, color: C.textMuted }}>
                    {confidenceHints.spans.length} {t('vn.confidence_passages')}
                  </Text>
                  {confidenceHints.spans.map((span, idx) => (
                    <View
                      key={`${span.startChar}-${span.endChar}-${idx}`}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor: C.surfaceVariant,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: span.band === 'review' ? '#DC2626' : '#D97706', marginBottom: 4 }}>
                        {span.band === 'review'
                          ? (isAr ? 'مراجعة' : 'À revoir')
                          : (isAr ? 'غير مؤكد' : 'Incertain')}
                        {span.minuteLabel ? ` · min ${span.minuteLabel}` : ''}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }} numberOfLines={4}>
                        {span.excerpt}
                      </Text>
                      {typeof span.approxStartSec === 'number' ? (
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}
                          onPress={() => playAudioAtApproxSec(span.approxStartSec!)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <AppIcon name="playCircleOutline" size={18} color={WHISPER_COLOR} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: WHISPER_COLOR }}>
                            {t('vn.confidence_listen')}
                            {span.approxStartSec != null
                              ? ` (~${Math.floor(span.approxStartSec / 60)}:${String(span.approxStartSec % 60).padStart(2, '0')})`
                              : ''}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: C.textMuted }}>{t('vn.confidence_none')}</Text>
              )}
            </View>
          )}
        </View>
          </ScrollView>

          <ScrollView
            style={[styles.tabScroll, { opacity: mainTab === 'ai' ? 1 : 0 }]}
            pointerEvents={mainTab === 'ai' ? 'auto' : 'none'}
            contentContainerStyle={{ paddingBottom: bottomPad, paddingTop: 4 }}
            showsVerticalScrollIndicator={mainTab === 'ai'}
            keyboardShouldPersistTaps="handled"
          >
        <View style={[styles.aiStudioCard, { marginHorizontal: Spacing.base }]}>
          <View style={styles.sectionHeader}>
            <LinearGradient colors={[...Gradients.violet]} style={styles.aiStudioIcon}>
              <AppIcon name='sparkles' size={16} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabelAccent}>
                {t('vn.ai_title')}
              </Text>
              <Text style={styles.sectionSub}>
                {isAr ? 'ملخص، إعادة صياغة، درس، بطاقات' : 'Résumé, réécriture, cours, flashcards'}
              </Text>
            </View>
          </View>

          {note.status === 'processing' ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
              <ActivityIndicator color={WHISPER_COLOR} />
              <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center' }}>
                {isAr ? 'ستتاح الإجراءات بعد اكتمال النسخ' : 'Disponible après la transcription…'}
              </Text>
            </View>
          ) : (
            <>
            <View style={styles.modelSelectorWrap}>
              <Text style={styles.modelSelectorLabel}>
                {isAr ? 'نموذج الذكاء الاصطناعي' : 'Modèle IA'}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.modelChipsRow}
              >
                {([
                  { key: 'gpt-4o-mini',  label: 'GPT-4o mini', sub: isAr ? 'سريع' : 'Rapide',      free: false },
                  { key: 'gpt-4o',       label: 'GPT-4o',      sub: isAr ? 'الأفضل' : 'Qualité max', free: false },
                  { key: 'groq-llama',   label: 'LLaMA 3.3',   sub: 'Groq',                        free: true  },
                  { key: 'gemini-flash', label: 'Gemini Flash',sub: 'Google',                      free: true  },
                ] as const).map(m => {
                  const active = selectedModel === m.key;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      onPress={() => setSelectedModel(m.key)}
                      activeOpacity={0.75}
                      style={[styles.modelChip, active && styles.modelChipActive]}
                    >
                      <Text style={[styles.modelChipTitle, active && styles.modelChipTitleActive]}>
                        {m.label}
                      </Text>
                      <Text style={[styles.modelChipSub, active && styles.modelChipSubActive]}>
                        {m.sub}{m.free ? ' · ' + (isAr ? 'مجاني' : 'Gratuit') : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.actionsContainer}>
            {AI_ACTIONS.map((action, idx) => {
              const isThis    = activeAction === action.mode;
              const isDone    = completedModes.has(action.mode);
              const isLoading = enhanceLoading && isThis;
              const isLast    = idx === AI_ACTIONS.length - 1;

              return (
                <View key={action.mode}>
                  <TouchableOpacity
                    style={[styles.actionRow, isDone && styles.actionRowDone, isLast && { borderBottomWidth: 0 }]}
                    onPress={() => handleEnhance(action.mode)}
                    disabled={enhanceLoading}
                    activeOpacity={0.75}
                  >
                    <LinearGradient
                      colors={action.gradient}
                      style={styles.actionIcon}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      {isLoading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <AppIcon name={isDone ? 'checkmarkCircle' : action.icon} size={22} color="#fff" />
                      }
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionLabel}>
                        {isAr ? action.labelAr : action.labelFr}
                      </Text>
                      <Text style={styles.actionDesc}>
                        {isAr ? action.descAr : action.descFr}
                      </Text>
                    </View>
                    {isDone ? (
                      <LinearGradient
                        colors={[action.gradient[0] + '30', action.gradient[1] + '20']}
                        style={styles.donePill}
                      >
                        <AppIcon name='checkmark' size={11} color={action.gradient[0]} />
                        <Text style={[styles.donePillText, { color: action.gradient[0] }]}>
                          {t('vn.done_badge')}
                        </Text>
                      </LinearGradient>
                    ) : (
                      <AppIcon name="chevronForward" size={18} color={C.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          </>
          )}
        </View>
          </ScrollView>

          {showTranscriptScrollFab ? (
            <TouchableOpacity
              style={[styles.scrollFab, { bottom: Math.max(insets.bottom, 10) + 8 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                transcriptScrollRef.current?.scrollToEnd({ animated: true });
              }}
              activeOpacity={0.92}
            >
              <AppIcon name="chevronDown" size={18} color="#FFFFFF" />
              <Text style={styles.scrollFabText}>{isAr ? 'الأسفل' : 'Bas du texte'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* ── Modal résultat IA ── */}
      <Modal
        visible={showResultModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: C.background }]} edges={['top']}>
          {/* Header modal */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {resultMode === 'summary'    ? `📋 ${t('vn.ai.summary.label')}`
                 : resultMode === 'rewrite' ? `✏️ ${t('vn.ai.rewrite.label')}`
                 : resultMode === 'course'  ? `🎓 ${isAr ? 'الدرس الكامل' : 'Cours IA'}`
                 :                            `🃏 ${t('vn.ai.flashcards.label')}`}
              </Text>
              {resultCards && (
                <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  {resultCards.length} {t('vn.ai.flashcards.label')}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={closeModal}>
              <AppIcon name='close' size={20} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

            {/* ── AI Course ── */}
            {resultMode === 'course' && resultText ? (
              <CourseRenderer text={resultText} C={C} isAr={isAr} />
            ) : null}

            {/* ── Summary ── */}
            {resultEnhanced?.summary ? (
              <View style={styles.enhancedSection}>
                <Text style={styles.enhancedSectionLabel}>{isAr ? '📋 الملخص' : '📋 Summary'}</Text>
                <Text style={styles.resultText} selectable>{resultEnhanced.summary}</Text>
              </View>
            ) : null}

            {/* ── Clean transcript ── */}
            {resultEnhanced ? (
              <View style={styles.enhancedSection}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  <TouchableOpacity
                    style={[styles.tabChip, transcriptTab === 'clean' && styles.tabChipActive]}
                    onPress={() => setTranscriptTab('clean')}
                  >
                    <Text style={[styles.tabChipText, transcriptTab === 'clean' && styles.tabChipTextActive]}>
                      {isAr ? '✅ نص محسّن' : '✅ Clean'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabChip, transcriptTab === 'raw' && styles.tabChipActive]}
                    onPress={() => setTranscriptTab('raw')}
                  >
                    <Text style={[styles.tabChipText, transcriptTab === 'raw' && styles.tabChipTextActive]}>
                      {isAr ? '📝 خام' : '📝 Raw'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.resultTextBox}>
                  <Text style={styles.resultText} selectable>
                    {transcriptTab === 'clean'
                      ? resultEnhanced.clean_transcript
                      : (note.transcript ?? '')}
                  </Text>
                </View>
              </View>
            ) : resultText && resultMode !== 'course' ? (
              <View style={styles.resultTextBox}>
                <Text style={styles.resultText} selectable>{resultText}</Text>
              </View>
            ) : null}

            {/* ── Action Items ── */}
            {resultEnhanced?.action_items?.length ? (
              <View style={styles.enhancedSection}>
                <Text style={styles.enhancedSectionLabel}>{isAr ? '✅ المهام' : '✅ Action Items'}</Text>
                {resultEnhanced.action_items.map((item, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText} selectable>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* ── Key Topics ── */}
            {resultEnhanced?.key_topics?.length ? (
              <View style={styles.enhancedSection}>
                <Text style={styles.enhancedSectionLabel}>{isAr ? '🏷 المواضيع' : '🏷 Key Topics'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {resultEnhanced.key_topics.map((t, i) => (
                    <View key={i} style={styles.topicPill}>
                      <Text style={styles.topicPillText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* ── Unclear segments ── */}
            {resultEnhanced?.unclear_segments?.length ? (
              <View style={styles.enhancedSection}>
                <Text style={styles.enhancedSectionLabel}>{isAr ? '⚠️ أجزاء غير واضحة' : '⚠️ Unclear Segments'}</Text>
                {resultEnhanced.unclear_segments.map((seg, i) => (
                  <View key={i} style={styles.unclearRow}>
                    <Text style={styles.unclearText} selectable>{seg}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {resultCards && resultCards.map((card, i) => (
              <View key={i} style={styles.flashcardItem}>
                <LinearGradient colors={[WHISPER_COLOR + '25', WHISPER_COLOR + '10']} style={styles.flashcardFront}>
                  <Text style={styles.flashcardLabel}>
                    {isAr ? `سؤال ${i + 1}` : `Q${i + 1}`}
                  </Text>
                  <Text style={styles.flashcardFrontText}>{card.front}</Text>
                </LinearGradient>
                <View style={styles.flashcardBack}>
                  <Text style={styles.flashcardLabel}>{isAr ? 'الجواب' : 'Réponse'}</Text>
                  <Text style={styles.flashcardBackText}>{card.back}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {resultMode === 'course' && resultText && (
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.ctaBtn}
                onPress={async () => {
                  try {
                    await Share.share({ title: note.title || 'Cours IA', message: resultText });
                  } catch {}
                }}
              >
                <LinearGradient
                  colors={['#F59E0B', '#B45309']}
                  style={styles.ctaBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <AppIcon name="shareOutline" size={18} color="#fff" />
                  <Text style={styles.ctaBtnText}>
                    {isAr ? 'مشاركة الدرس' : 'Partager le cours'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {resultMode === 'flashcards' && resultDeckId && (
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.ctaBtn}
                onPress={() => { closeModal(); navigation.navigate('Main'); }}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#6D28D9']}
                  style={styles.ctaBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <AppIcon name='albums' size={18} color="#fff" />
                  <Text style={styles.ctaBtnText}>
                    {t('vn.ai.flashcards.label')}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Modal diff retranscription ── */}
      <Modal
        visible={showDiffModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDiffModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: C.background }]} edges={['top']}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {isAr ? '🔄 إعادة النسخ — الكلمات المُعدَّلة' : '🔄 Retranscription — Mots modifiés'}
              </Text>
              <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
                {isAr
                  ? 'الكلمات المُسطَّرة بالبنفسجي تمّ تصحيحها أو إضافتها'
                  : 'Les mots soulignés en violet ont été corrigés ou ajoutés'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowDiffModal(false)} style={styles.modalCloseBtn}>
              <AppIcon name='close' size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          >
            {diffedTranscript ? (
              <DiffText text={diffedTranscript} C={C} isAr={isAr} />
            ) : null}
          </ScrollView>

          <View style={[styles.modalFooter, { flexDirection: 'row', gap: 10 }]}>
            {/* Reject: revert to previous version */}
            <TouchableOpacity
              style={[styles.ctaBtn, { flex: 1 }]}
              onPress={handleRejectRetranscribe}
              disabled={restoreLoading || transcriptVersions.length === 0}
            >
              <LinearGradient
                colors={['#DC2626', '#991B1B']}
                style={styles.ctaBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {restoreLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <AppIcon name="arrowUndo" size={17} color="#fff" />}
                <Text style={styles.ctaBtnText}>
                  {isAr ? 'رفض — استعادة السابق' : 'Rejeter'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Accept: keep new transcript */}
            <TouchableOpacity
              style={[styles.ctaBtn, { flex: 1 }]}
              onPress={() => {
                setShowDiffModal(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
            >
              <LinearGradient
                colors={[WHISPER_COLOR, '#5B21B6']}
                style={styles.ctaBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <AppIcon name="checkmarkCircle" size={17} color="#fff" />
                <Text style={styles.ctaBtnText}>
                  {isAr ? 'قبول' : 'Accepter'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Modal historique des versions ── */}
      <Modal
        visible={showHistoryModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: C.background }]} edges={['top']}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {isAr ? '🕐 سجل الإصدارات' : '🕐 Historique des versions'}
              </Text>
              <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
                {isAr
                  ? `${transcriptVersions.length} إصدار محفوظ — اضغط لاستعادة أي إصدار`
                  : `${transcriptVersions.length} version(s) sauvegardée(s) — appuyez pour restaurer`}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={styles.modalCloseBtn}>
              <AppIcon name='close' size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          >
            {/* Current version at top */}
            <View style={{
              backgroundColor: C.surface,
              borderRadius: 12,
              padding: 14,
              borderWidth: 2,
              borderColor: WHISPER_COLOR,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <AppIcon name="checkmarkCircle" size={15} color={WHISPER_COLOR} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: WHISPER_COLOR }}>
                  {isAr ? 'الإصدار الحالي' : 'Version actuelle'}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: C.textPrimary, lineHeight: 20 }} numberOfLines={4}>
                {transcript || (isAr ? 'لا يوجد نص' : 'Aucun texte')}
              </Text>
            </View>

            {/* Saved versions — most recent first */}
            {[...transcriptVersions].reverse().map((v, reversedIdx) => {
              const realIdx = transcriptVersions.length - 1 - reversedIdx;
              const savedDate = new Date(v.saved_at);
              const dateLabel = savedDate.toLocaleDateString(isAr ? 'ar-DZ' : 'fr-FR', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              });
              return (
                <View key={realIdx} style={{
                  backgroundColor: C.surface,
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: C.border,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppIcon name="timeOutline" size={14} color={C.textMuted} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSecondary }}>
                        {v.label}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: C.textMuted }}>{dateLabel}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 19, marginBottom: 12 }} numberOfLines={5}>
                    {v.transcript || (isAr ? 'فارغ' : 'Vide')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRestoreVersion(realIdx)}
                    disabled={restoreLoading}
                    style={{
                      backgroundColor: WHISPER_COLOR + '18',
                      borderRadius: 8,
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      alignSelf: 'flex-end',
                    }}
                  >
                    {restoreLoading
                      ? <ActivityIndicator size="small" color={WHISPER_COLOR} />
                      : <AppIcon name='refresh' size={14} color={WHISPER_COLOR} />}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: WHISPER_COLOR }}>
                      {isAr ? 'استعادة' : 'Restaurer'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
    </PremiumGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: typeof Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },

    // ── Header (gradient, aligné Whisper list) ─────────────────────────────
    headerGradient: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.base,
      borderBottomLeftRadius: BorderRadius.xl,
      borderBottomRightRadius: BorderRadius.xl,
      ...Shadows.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    headerBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.32)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleOnGradient: {
      fontSize: 17,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.2,
    },
    headerMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    subjectPillOnGradient: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
    },
    subjectPillOnGradientText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
    metaPillOnGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.18)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
    },
    metaPillOnGradientText: { fontSize: 11, color: 'rgba(255,255,255,0.92)', fontWeight: '600' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 4 },
    headerIconBtnLight: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
    },
    headerIconBtnDanger: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(220,38,38,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(254,202,202,0.45)',
    },
    headerBadge: {
      position: 'absolute',
      top: -4,
      right: -5,
      backgroundColor: '#FFFFFF',
      borderRadius: 7,
      minWidth: 14,
      height: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerBadgeText: { color: WHISPER_COLOR, fontSize: 9, fontWeight: '800' },

    body: { flex: 1, minHeight: 0 },
    playerStrip: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    tabBar: {
      flexDirection: 'row',
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.sm,
      backgroundColor: C.surfaceVariant,
      borderRadius: BorderRadius.pill,
      padding: 3,
      borderWidth: 1,
      borderColor: C.border,
      gap: 4,
    },
    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 22,
    },
    tabItemActive: {
      backgroundColor: WHISPER_COLOR,
      ...Shadows.brand,
    },
    tabItemLabel: { fontSize: 13, fontWeight: '700', color: C.textMuted },
    tabItemLabelActive: { color: '#FFFFFF' },
    tabBadge: {
      marginStart: 6,
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: C.border,
      alignItems: 'center',
    },
    tabBadgeOnActive: {
      backgroundColor: 'rgba(255,255,255,0.28)',
    },
    tabBadgeText: { fontSize: 10, fontWeight: '800', color: C.textSecondary },
    tabBadgeTextOnActive: { color: '#FFFFFF' },
    tabContentWrap: {
      flex: 1,
      minHeight: 0,
      position: 'relative',
    },
    tabScroll: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    scrollFab: {
      position: 'absolute',
      end: Spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: BorderRadius.pill,
      backgroundColor: WHISPER_COLOR,
      ...Shadows.brand,
      zIndex: 50,
      elevation: 12,
    },
    scrollFabText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

    // ── Sections ───────────────────────────────────────────────────────────
    section: { marginBottom: Spacing.xl },
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: 12,
    },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: C.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },
    sectionLabelAccent: {
      fontSize: 13,
      fontWeight: '800',
      color: C.textPrimary,
      letterSpacing: 0.2,
    },
    sectionSub: {
      fontSize: 11,
      color: C.textMuted,
      marginTop: 2,
      fontWeight: '500',
    },
    transcriptShell: {
      backgroundColor: C.surface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: Spacing.base,
      ...Shadows.sm,
    },
    transcriptHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    aiStudioCard: {
      backgroundColor: C.surface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: Spacing.base,
      ...Shadows.sm,
    },
    aiStudioIcon: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.sm,
      ...Shadows.brand,
    },
    // ── Action rows ────────────────────────────────────────────────────────
    actionsContainer: {
      backgroundColor: C.surface,
      borderRadius: 16,
      borderWidth: 1, borderColor: C.border,
      overflow: 'hidden',
    },

    // ── Model selector chips (above the AI actions list) ─────────────────
    modelSelectorWrap: { marginBottom: Spacing.sm },
    modelSelectorLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textMuted,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginHorizontal: 2,
    },
    modelChipsRow: { gap: 8, paddingRight: 8 },
    modelChip: {
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 9,
      minWidth: 110,
    },
    modelChipActive: {
      backgroundColor: WHISPER_COLOR + '14',
      borderColor: WHISPER_COLOR,
    },
    modelChipTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: C.textPrimary,
    },
    modelChipTitleActive: { color: WHISPER_COLOR },
    modelChipSub: {
      fontSize: 10,
      fontWeight: '500',
      color: C.textMuted,
      marginTop: 2,
    },
    modelChipSubActive: { color: WHISPER_COLOR + 'CC' },

    actionRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      padding: 16,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    actionRowDone: { backgroundColor: WHISPER_COLOR + '06' },
    actionIcon: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
    },
    actionLabel: { fontSize: 15, fontWeight: '700', color: C.textPrimary },
    actionDesc:  { fontSize: 12, color: C.textMuted, marginTop: 1 },
    donePill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 9, paddingVertical: 4,
      borderRadius: 10, overflow: 'hidden',
    },
    donePillText: { fontSize: 11, fontWeight: '700' },

    // ── Transcript ─────────────────────────────────────────────────────────
    smallBtn: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    },
    transcriptBox: {
      backgroundColor: C.surfaceVariant,
      borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: C.border,
    },
    transcriptText: {
      fontSize: 16, color: C.textPrimary, lineHeight: 28,
    },
    transcriptEditor: {
      backgroundColor: C.surface,
      borderRadius: 14, padding: 16,
      borderWidth: 2, borderColor: WHISPER_COLOR,
      color: C.textPrimary, fontSize: 16, lineHeight: 28,
      minHeight: 200,
    },
    transcriptMeta: {
      fontSize: 11, color: C.textMuted,
      marginTop: 8, textAlign: 'right',
    },

    // ── Modal résultat ─────────────────────────────────────────────────────
    modalContainer: { flex: 1 },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: C.textPrimary },
    closeBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.surfaceVariant,
      alignItems: 'center', justifyContent: 'center',
    },
    resultTextBox: {
      backgroundColor: C.surfaceVariant,
      borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: C.border,
    },
    resultText: { fontSize: 15, color: C.textPrimary, lineHeight: 26 },
    flashcardItem: {
      borderRadius: 14, overflow: 'hidden',
      marginBottom: 12, borderWidth: 1, borderColor: C.border,
    },
    flashcardFront: { padding: 14 },
    flashcardBack:  { backgroundColor: C.surface, padding: 14 },
    flashcardLabel: {
      fontSize: 10, fontWeight: '700', color: WHISPER_COLOR,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
    },
    flashcardFrontText: { fontSize: 15, fontWeight: '600', color: C.textPrimary, lineHeight: 22 },
    flashcardBackText:  { fontSize: 14, color: C.textSecondary, lineHeight: 22 },
    modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: C.border },
    ctaBtn: {
      borderRadius: 14, overflow: 'hidden',
      shadowColor: WHISPER_COLOR,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    ctaBtnGrad: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 8, padding: 16,
    },
    ctaBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    // ── Enhanced result sections ───────────────────────────────────────────
    enhancedSection: {
      marginBottom: 20,
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    enhancedSectionLabel: {
      fontSize: 12, fontWeight: '700', color: C.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.6,
      marginBottom: 10,
    },

    // Transcript tabs
    tabChip: {
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
      backgroundColor: C.surfaceVariant,
      borderWidth: 1, borderColor: C.border,
    },
    tabChipActive:     { backgroundColor: WHISPER_COLOR + '20', borderColor: WHISPER_COLOR },
    tabChipText:       { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
    tabChipTextActive: { color: WHISPER_COLOR },

    // Bullet list (action items)
    bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    bulletDot: { fontSize: 16, color: WHISPER_COLOR, lineHeight: 22 },
    bulletText: { flex: 1, fontSize: 14, color: C.textPrimary, lineHeight: 22 },

    // Topic pills
    topicPill: {
      paddingHorizontal: 10, paddingVertical: 4,
      backgroundColor: WHISPER_COLOR + '15',
      borderRadius: 12,
      borderWidth: 1, borderColor: WHISPER_COLOR + '40',
    },
    topicPillText: { fontSize: 12, color: WHISPER_COLOR, fontWeight: '600' },

    // Unclear segments
    unclearRow: {
      backgroundColor: '#F59E0B18',
      borderRadius: 8, padding: 10, marginBottom: 6,
      borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    },
    unclearText: { fontSize: 13, color: '#92400E', lineHeight: 20 },

    // ── Audio player ─────────────────────────────────────────────────────
    playerCard: {
      borderRadius: BorderRadius.lg,
      padding: Spacing.base,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 0,
      ...Shadows.sm,
    },
    playBtn: {
      shadowColor: WHISPER_COLOR,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
    },
    playBtnGrad: {
      width: 52, height: 52, borderRadius: 26,
      alignItems: 'center', justifyContent: 'center',
    },
    progressTrack: {
      height: 6, borderRadius: 3,
      backgroundColor: WHISPER_COLOR + '25',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%', borderRadius: 3,
      backgroundColor: WHISPER_COLOR,
    },
    progressThumb: {
      position: 'absolute', top: -4,
      width: 14, height: 14, borderRadius: 7,
      backgroundColor: WHISPER_COLOR,
      marginLeft: -7,
      shadowColor: WHISPER_COLOR,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.5, shadowRadius: 4, elevation: 4,
    },
    timeText: { fontSize: 11, color: C.textMuted, fontVariant: ['tabular-nums'] },

    // ── Speaker filter ──────────────────────────────────────────────────────
    speakerChip: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 20, borderWidth: 1.5,
      borderColor: C.border, backgroundColor: C.surface,
    },
    speakerChipActive: {
      borderColor: WHISPER_COLOR, backgroundColor: `${WHISPER_COLOR}22`,
    },
    speakerChipText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
    speakerChipTextActive: { color: WHISPER_COLOR },
    saveFilterBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginTop: 10, alignSelf: 'flex-start',
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 8, borderWidth: 1,
      borderColor: `${WHISPER_COLOR}55`, backgroundColor: `${WHISPER_COLOR}11`,
    },
    saveFilterText: { fontSize: 12, color: WHISPER_COLOR, fontWeight: '600' },
    modalCloseBtn: { padding: 6 },
  });
}
