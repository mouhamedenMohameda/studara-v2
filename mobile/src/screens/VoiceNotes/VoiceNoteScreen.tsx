/**
 * VoiceNoteScreen — Whisper Studio 🎙️
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator, Animated, ScrollView, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
// Use expo-audio (new-architecture compatible) for recording. expo-av's
// Audio.Recording silently fails to capture audio on Android release builds
// with newArchEnabled=true, so we migrated to expo-audio which is Expo's
// official replacement and is explicitly supported under new architecture.
import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import type { AudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';

// Build per-platform recording options matching what Whisper prefers (16kHz
// mono, low bitrate M4A). Flattens the {ios,android} config because
// AudioRecorder's constructor takes already-flattened options.
function buildRecordingOptions() {
  const base = {
    extension: RecordingPresets.HIGH_QUALITY.extension,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 48000,
    isMeteringEnabled: false,
  };
  if (Platform.OS === 'android') {
    return { ...base, ...RecordingPresets.HIGH_QUALITY.android, ...base };
  }
  if (Platform.OS === 'ios') {
    return { ...base, ...RecordingPresets.HIGH_QUALITY.ios, ...base };
  }
  return base;
}

// Helper: create + prepare + start a new AudioRecorder. Returns the recorder
// once recording has actually started on the native side.
async function createAndStartRecorder(): Promise<AudioRecorder> {
  const rec = new (AudioModule as any).AudioRecorder(buildRecordingOptions()) as AudioRecorder;
  await rec.prepareToRecordAsync();
  rec.record();
  return rec;
}
import { useAuth }          from '../../context/AuthContext';
import { useTheme }         from '../../context/ThemeContext';
import { useLanguage }      from '../../context/LanguageContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import { RootStackParamList, VoiceNote } from '../../types';
import { API_BASE } from '../../utils/api';
import { notifyWalletSpent } from '../../utils/walletUtils';
import { computePaygChargeMru } from '@/utils/paygCharge';
import { getPaygFeature } from '@/constants/paygFeatures';
import { Colors, BorderRadius, Gradients, Shadows, Spacing } from '../../theme';
import { usePremiumFeature } from '../../hooks/usePremiumFeature';
import PremiumGate from '../../components/common/PremiumGate';
import { safeBack } from '../../utils/safeBack';

type Nav = StackNavigationProp<RootStackParamList, 'VoiceNotes'>;

const WHISPER_COLOR = '#7C3AED';
const RECORD_COLOR  = '#EF4444';
const MAX_DURATION  = 60 * 60;

const QUICK_SUBJECTS = [
  { label: 'Maths',     icon: '📐' },
  { label: 'Physique',  icon: '⚛️' },
  { label: 'Chimie',    icon: '🧪' },
  { label: 'Biologie',  icon: '🧬' },
  { label: 'Droit',     icon: '⚖️' },
  { label: 'Économie',  icon: '📊' },
  { label: 'Histoire',  icon: '📜' },
  { label: 'Anglais',   icon: '🇬🇧' },
  { label: 'Info',      icon: '💻' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── Badge statut amélioré ────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: VoiceNote['status'] }) => {
  const { t } = useLanguage();
  const config = {
    done:       { color: '#10B981', bg: '#10B98118', dot: '#10B981', label: t('vn.status.done') },
    processing: { color: '#F59E0B', bg: '#F59E0B18', dot: '#F59E0B', label: t('vn.status.processing') },
    failed:     { color: '#EF4444', bg: '#EF444418', dot: '#EF4444', label: t('vn.status.failed') },
  }[status] ?? { color: '#6B7280', bg: '#6B728018', dot: '#6B7280', label: status };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: config.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: config.dot }} />
      <Text style={{ color: config.color, fontSize: 11, fontWeight: '700' }}>{config.label}</Text>
    </View>
  );
};

// ─── Waveform à 13 barres ─────────────────────────────────────────────────────

const BAR_HEIGHTS = [14, 22, 32, 42, 50, 44, 54, 44, 50, 42, 32, 22, 14];

const WaveformBars = ({ isRecording }: { isRecording: boolean }) => {
  const anims = useRef(Array.from({ length: 13 }, () => new Animated.Value(0.12))).current;

  useEffect(() => {
    if (!isRecording) {
      anims.forEach(a => Animated.spring(a, { toValue: 0.12, useNativeDriver: true }).start());
      return;
    }
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 55),
          Animated.spring(anim, { toValue: 0.6 + (i % 3) * 0.15, speed: 3 + (i % 4), bounciness: 10, useNativeDriver: true }),
          Animated.spring(anim, { toValue: 0.12 + (i % 2) * 0.12, speed: 3 + (i % 4), bounciness: 10, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [isRecording, anims]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 64 }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3.5,
            height: BAR_HEIGHTS[i],
            borderRadius: 2,
            backgroundColor: isRecording ? RECORD_COLOR : 'rgba(239,68,68,0.25)',
            transform: [{ scaleY: anim }],
            opacity: isRecording ? 1 : 0.5,
          }}
        />
      ))}
    </View>
  );
};

// ─── Anneaux pulsants ─────────────────────────────────────────────────────────

const PulsingRings = ({ isActive }: { isActive: boolean }) => {
  const rings = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    if (!isActive) { rings.forEach(r => r.setValue(0)); return; }

    const loops = rings.map((r, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 450),
          Animated.parallel([
            Animated.timing(r, { toValue: 1, duration: 1400, useNativeDriver: true }),
          ]),
          Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [isActive, rings]);

  if (!isActive) return null;
  return (
    <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
      {rings.map((r, i) => (
        <Animated.View key={i} style={{
          position: 'absolute',
          width: 80 + i * 30, height: 80 + i * 30,
          borderRadius: (80 + i * 30) / 2,
          borderWidth: 1.5,
          borderColor: RECORD_COLOR,
          opacity: r.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.7, 0.3, 0] }),
          transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.45] }) }],
        }} />
      ))}
    </View>
  );
};

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function VoiceNoteScreen() {
  const navigation   = useNavigation<Nav>();
  const { token }    = useAuth();
  const { colors: C, isDark } = useTheme();
  const { lang, t }  = useLanguage();
  const { fontSize } = useAccessibility();
  const isAr         = lang === 'ar';
  const styles       = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  const { hasAccess, loading: premiumLoading, balanceMru, totalSpentMru, refetch: refetchBalance } = usePremiumFeature('whisper_studio');

  // ── État enregistrement ────────────────────────────────────────────────────
  const [isRecording, setIsRecording]   = useState(false);
  const [isPaused, setIsPaused]         = useState(false);
  const [duration, setDuration]         = useState(0);
  const [isUploading, setIsUploading]   = useState(false);
  const recordingRef       = useRef<AudioRecorder | null>(null);
  const lastRecordingUriRef = useRef<string | null>(null); // URI of last stopped segment
  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTranscriptsRef = useRef<string[]>([]); // accumulated live chunks
  const pollingTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppingRef      = useRef(false); // mutex: stop pressed, ignore chunk cycle
  const chunkBusyRef       = useRef(false); // mutex: chunk cycle in progress

  // ── Live transcript (temps réel pendant l'enregistrement) ─────────────────
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isChunking, setIsChunking]         = useState(false); // spinner chunk en cours

  // Parse OpenAI errors and return user-friendly messages
  const parseTranscriptionError = (errorMessage: string): string => {
    try {
      // Try to parse JSON error from OpenAI
      if (errorMessage.includes('"error"') || errorMessage.includes('OpenAI')) {
        const match = errorMessage.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const msg = parsed.error?.message || parsed.message || '';
          
          if (msg.includes('corrupted') || msg.includes('unsupported')) {
            return lang === 'ar' 
              ? 'ملف الصوت تالف أو غير مدعوم. حاول تسجيل جديد أو استخدم ملف آخر.'
              : 'Fichier audio corrompu ou non pris en charge. Essayez un nouvel enregistrement.';
          }
          if (msg.includes('quota') || msg.includes('exceeded')) {
            return lang === 'ar'
              ? 'تم تجاوز حصة الخدمة. يرجى المحاولة لاحقاً.'
              : 'Quota de transcription dépassé. Réessayez plus tard.';
          }
          if (msg.includes('too large') || msg.includes('file size')) {
            return lang === 'ar'
              ? 'الملف كبير جداً (أكثر من 500 ميجابايت).'
              : 'Fichier trop volumineux (max 500 Mo).';
          }
          if (msg.includes('invalid') && msg.includes('model')) {
            return lang === 'ar'
              ? 'خطأ في إعدادات الخدمة. يرجى الإبلاغ عن المشكلة.'
              : 'Erreur de configuration du service. Veuillez signaler le problème.';
          }
          // Return the actual OpenAI message if we can't categorize it
          if (msg && msg.length < 200) return msg;
        }
      }
    } catch {}
    
    // Fallback for network errors
    if (errorMessage.includes('Network') || errorMessage.includes('Failed to fetch')) {
      return lang === 'ar'
        ? 'فشل الاتصال بالخادم. تحقق من اتصال الإنترنت.'
        : 'Échec de connexion au serveur. Vérifiez votre connexion Internet.';
    }
    
    // If error message is already short and clear, use it
    if (errorMessage.length < 150) return errorMessage;
    
    // Generic fallback
    return lang === 'ar'
      ? 'حدث خطأ أثناء النسخ. يرجى المحاولة مرة أخرى.'
      : 'Erreur lors de la transcription. Veuillez réessayer.';
  };

  // ── Métadonnées ────────────────────────────────────────────────────────────
  const [title, setTitle]       = useState('');
  const [subject, setSubject]   = useState('');
  const [lang2, setLang2]       = useState<'ar' | 'fr'>('ar');
  const [diarize, setDiarize]   = useState(false);
  const [transcriptionModel, setTranscriptionModel] = useState<'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe' | 'groq-whisper' | 'google-chirp'>('gpt-4o-transcribe');

  // ── Liste des notes ────────────────────────────────────────────────────────
  const [notes, setNotes]         = useState<VoiceNote[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch]           = useState('');
  /** Studio = capture & réglages · Coffre = liste uniquement (transcription longue ≠ scroll infini) */
  const [homeTab, setHomeTab]         = useState<'studio' | 'vault'>('studio');
  const [titleEdit, setTitleEdit]     = useState<{ id: string; draft: string } | null>(null);
  const [titleEditSaving, setTitleEditSaving] = useState(false);
  const insets                        = useSafeAreaInsets();

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(n =>
      n.title?.toLowerCase().includes(q) ||
      n.subject?.toLowerCase().includes(q) ||
      n.transcript_preview?.toLowerCase().includes(q),
    );
  }, [notes, search]);
  // ── Pulsebeat du bouton record ─────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording && !isPaused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPaused, pulseAnim]);

  // ── Charger la liste ───────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const res = await fetch(`${API_BASE}/voice-notes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as VoiceNote[];
        setNotes(data);
      }
    } catch {}
    setLoadingList(false);
  }, [token]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // ── Polling : réactualise la liste jusqu'à ce que toutes les notes soient done/failed ──
  const startPolling = useCallback(() => {
    if (pollingTimerRef.current) return; // déjà actif
    pollingTimerRef.current = setInterval(async () => {
      if (!token) return;
      const res = await fetch(`${API_BASE}/voice-notes`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json() as VoiceNote[];
      setNotes(data);
      // Arrête le polling quand plus aucune note n'est en cours
      const hasPending = data.some(n => n.status === 'processing');
      if (!hasPending && pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    }, 4000); // toutes les 4 secondes
  }, [token]);

  // Lance le polling si des notes sont en processing au mount
  useEffect(() => {
    if (notes.some(n => n.status === 'processing')) startPolling();
  }, [notes, startPolling]);

  // ── Nettoyage au démontage ─────────────────────────────────────────────────
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    if (recordingRef.current) recordingRef.current.stop().catch(() => {});
  }, []);

  // ── Démarrer l'enregistrement ──────────────────────────────────────────────
  const startRecording = async () => {
    if (!lang2) {
      Alert.alert(
        isAr ? 'اختر لغة التسجيل' : 'Choisissez la langue',
        isAr
          ? 'يجب تحديد لغة التسجيل (عربية أو فرنسية) قبل البدء حتى تكون النسخة بلغة واحدة فقط.'
          : 'Vous devez sélectionner la langue (arabe ou français) avant de commencer, pour que la transcription reste dans une seule langue.',
      );
      return;
    }
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(t('vn.mic_required'), t('vn.mic_msg'));
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      const recording = await createAndStartRecorder();

      recordingRef.current = recording;
      setHomeTab('studio');
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      setLiveTranscript('');
      chunkTranscriptsRef.current = [];

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      timerRef.current = setInterval(() => {
        setDuration(d => {
          if (d >= MAX_DURATION) {
            stopAndUpload();
            return d;
          }
          return d + 1;
        });
      }, 1000);

      // ── Chunk every 8s: stop → clean finalized M4A → new recording → transcribe → append ──
      chunkTimerRef.current = setInterval(async () => {
        // Skip if stop was pressed or another chunk cycle is already running
        if (!recordingRef.current || !token || isStoppingRef.current || chunkBusyRef.current) return;
        chunkBusyRef.current = true;
        try {
          // Stop gives a properly finalized M4A — iOS can't read a live file
          const currentRec = recordingRef.current;
          recordingRef.current = null; // null immediately so stopAndUpload won't double-stop
          await currentRec.stop();
          const chunkUri = currentRec.uri;
          if (chunkUri) lastRecordingUriRef.current = chunkUri; // save for stopAndUpload fallback

          // If stop was pressed while we were stopping, don't start a new recording
          if (isStoppingRef.current) return;

          // Immediately start a fresh recording — no perceptible gap
          const nextRec = await createAndStartRecorder();
          if (!isStoppingRef.current) recordingRef.current = nextRec;

          if (!chunkUri) return;
          setIsChunking(true);
          const form = new FormData();
          form.append('audio', { uri: chunkUri, name: 'chunk.m4a', type: 'audio/m4a' } as any);
          if (lang2) form.append('language', lang2);
          const chunkRes = await fetch(`${API_BASE}/voice-notes/partial-transcribe`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          if (chunkRes.ok) {
            const { transcript } = await chunkRes.json();
            if (transcript?.trim()) {
              chunkTranscriptsRef.current.push(transcript.trim());
              setLiveTranscript(chunkTranscriptsRef.current.join(' '));
            }
          }
        } catch {}
        finally {
          setIsChunking(false);
          chunkBusyRef.current = false;
        }
      }, 8000);

    } catch (e: any) {
      Alert.alert(t('vn.error'), e.message ?? t('vn.transcription_error'));
    }
  };

  // ── Pause / Reprise ────────────────────────────────────────────────────────
  const togglePause = async () => {
    if (!recordingRef.current) return;
    if (isPaused) {
      recordingRef.current.record();
      setIsPaused(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      recordingRef.current.pause();
      setIsPaused(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // ── Annuler ────────────────────────────────────────────────────────────────
  const cancelRecording = async () => {
    isStoppingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    if (recordingRef.current) {
      await recordingRef.current.stop().catch(() => {});
      recordingRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setLiveTranscript('');
    isStoppingRef.current = false;
    chunkBusyRef.current  = false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Stop + Upload + Transcription ─────────────────────────────────────────
  const stopAndUpload = async () => {
    if (!token) return;
    if (isStoppingRef.current) return; // already stopping

    // Signal chunk timer to bail out of its current/next cycle
    isStoppingRef.current = true;

    if (timerRef.current) clearInterval(timerRef.current);
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);

    // Wait up to 2s for an in-progress chunk cycle to finish before we proceed
    if (chunkBusyRef.current) {
      await new Promise<void>(resolve => {
        const wait = setInterval(() => {
          if (!chunkBusyRef.current) { clearInterval(wait); resolve(); }
        }, 50);
        setTimeout(() => { clearInterval(wait); resolve(); }, 2000);
      });
    }

    try {
      setIsUploading(true);
      setIsRecording(false);
      setIsPaused(false);

      // recordingRef may have been nulled by the chunk timer during the wait
      let uri: string | null = null;
      if (recordingRef.current) {
        const rec = recordingRef.current;
        await rec.stop().catch(() => {});
        uri = rec.uri ?? null;
        recordingRef.current = null;
      } else {
        // Chunk timer already stopped it — use the URI it saved
        uri = lastRecordingUriRef.current;
      }

      if (!uri) throw new Error('URI d\'enregistrement introuvable');

      const finalDuration = duration;
      setDuration(0);

      await setAudioModeAsync({ allowsRecording: false });

      // ── Transcribe the final chunk + combine with previous chunks ───────────
      let combinedTranscript = '';
      try {
        const form2 = new FormData();
        form2.append('audio', { uri, name: 'final_chunk.m4a', type: 'audio/m4a' } as any);
        if (lang2) form2.append('language', lang2);
        const partialRes = await fetch(`${API_BASE}/voice-notes/partial-transcribe`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form2,
        });
        if (partialRes.ok) {
          const { transcript: lastChunk } = await partialRes.json();
          if (lastChunk?.trim()) chunkTranscriptsRef.current.push(lastChunk.trim());
        }
      } catch {}
      combinedTranscript = chunkTranscriptsRef.current.join(' ').trim();

      // ── Upload final audio + pre-built transcript ───────────────────────────
      const recordingFilename = `recording_${Date.now()}.m4a`;
      const form = new FormData();
      form.append('audio', { uri, name: recordingFilename, type: 'audio/m4a' } as any);
      if (title)               form.append('title', title);
      if (subject)             form.append('subject', subject);
      if (lang2)               form.append('language', lang2);
      if (diarize)             form.append('diarize', 'true');
      form.append('transcription_model', transcriptionModel);
      if (combinedTranscript)  form.append('pre_transcript', combinedTranscript);
      form.append('duration_s', String(finalDuration));

      const res = await fetch(`${API_BASE}/voice-notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Notifier le débit PAYG (exactement selon la grille de prix affichée)
      const minutes = Math.max(1, Math.ceil(finalDuration / 60));
      const chargeMru = computePaygChargeMru({
        featureKey: 'whisper_studio',
        modelKey: transcriptionModel,
        minutes,
      });
      if (chargeMru > 0) notifyWalletSpent('whisper_studio', chargeMru);

      // Rafraîchir la liste — la note est en "processing", on poll jusqu'à "done"
      await fetchNotes();
      setTitle('');
      setSubject('');
      setLang2('ar');
      startPolling();

      // Naviguer vers le détail même en mode processing (l'écran poll lui aussi)
      navigation.navigate('VoiceNoteDetail', { note: data as VoiceNote });

    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const userMessage = parseTranscriptionError(e.message ?? t('vn.error'));
      const filename = `recording_${Date.now()}.m4a`;
      Alert.alert(
        t('vn.transcription_error'),
        `${userMessage}\n\n📎 ${filename}`
      );
    } finally {
      setIsUploading(false);
      isStoppingRef.current = false;
      chunkBusyRef.current  = false;
    }
  };

  // ── Upload depuis la bibliothèque ──────────────────────────────────────
  const uploadFromLibrary = async () => {
    if (!token) return;
    let asset: any = null; // Declared here to be accessible in catch block
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      asset = result.assets[0];
      const uri  = asset.uri;
      const name = asset.name || `upload_${Date.now()}.m4a`;
      const mime = asset.mimeType || 'audio/m4a';

      // Durée inconnue pour les fichiers uploadés
      setHomeTab('studio');
      setIsUploading(true);

      const form = new FormData();
      form.append('audio', { uri, name, type: mime } as any);
      if (title)   form.append('title', title || name.replace(/\.[^.]+$/, ''));
      if (subject) form.append('subject', subject);
      if (lang2)   form.append('language', lang2);
      if (diarize) form.append('diarize', 'true');
      form.append('transcription_model', transcriptionModel);
      form.append('duration_s', '0');

      const res  = await fetch(`${API_BASE}/voice-notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchNotes();
      setTitle('');
      setSubject('');
      setLang2('ar');
      startPolling();
      // La transcription se fait en arrière-plan — on navigue vers le détail (status: processing)
      navigation.navigate('VoiceNoteDetail', { note: data as VoiceNote });
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const userMessage = parseTranscriptionError(e.message ?? t('vn.error'));
      const filename = asset?.name || 'unknown';
      Alert.alert(
        t('vn.transcription_error'),
        `${userMessage}\n\n📎 ${filename}`
      );
    } finally {
      setIsUploading(false);
    }
  };

  // ── Supprimer une note ─────────────────────────────────────────────────────
  const deleteNote = (note: VoiceNote) => {
    Alert.alert(
      t('vn.delete_title'),
      `${note.title || t('vn.transcript')} ?`,
      [
        { text: t('vn.delete_cancel'), style: 'cancel' },
        {
          text: t('vn.delete_confirm'), style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_BASE}/voice-notes/${note.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token ?? ''}` },
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              setNotes(prev => prev.filter(n => n.id !== note.id));
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch {
              Alert.alert(t('vn.error'), t('vn.cannot_delete'));
            }
          },
        },
      ],
    );
  };

  // ── Renommer une note (coffre) ────────────────────────────────────────────
  const saveNoteTitle = async (id: string, draft: string) => {
    if (!token) return;
    setTitleEditSaving(true);
    try {
      const trimmed = draft.trim();
      const res = await fetch(`${API_BASE}/voice-notes/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: trimmed.length ? trimmed : null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as VoiceNote;
      setNotes(prev =>
        prev.map(n =>
          n.id === id
            ? { ...n, title: data.title ?? undefined, updated_at: data.updated_at ?? n.updated_at }
            : n,
        ),
      );
      setTitleEdit(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t('vn.error'), t('vn.cannot_save_title'));
    } finally {
      setTitleEditSaving(false);
    }
  };

  // ── Retenter une transcription échouée ────────────────────────────────────
  const handleRetry = useCallback((note: VoiceNote) => {
    Alert.alert(
      t('vn.retry_title'),
      note.error_message ?? t('vn.transcription_error'),
      [
        { text: t('vn.retry_cancel'), style: 'cancel' },
        { text: t('vn.retry_delete'), style: 'destructive', onPress: () => deleteNote(note) },
        {
          text: t('vn.retry_restart'),
          onPress: async () => {
            // Pre-fill metadata from the failed note
            if (note.title)   setTitle(note.title);
            if (note.subject) setSubject(note.subject);
            // Delete the failed entry silently
            try {
              await fetch(`${API_BASE}/voice-notes/${note.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token ?? ''}` },
              });
              setNotes(prev => prev.filter(n => n.id !== note.id));
            } catch {}
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ],
    );
  }, [isAr, deleteNote, token]);

  // ── Rendu d'une note — carte améliorée ─────────────────────────────────────
  const renderNote = ({ item }: { item: VoiceNote }) => {
    // Dots IA complétés
    const aiDots: string[] = [];
    if (item.deck_id || item.enhance_mode === 'flashcards') aiDots.push('#8B5CF6');
    if (item.ai_course) aiDots.push('#F59E0B');
    if (item.clean_transcript || (item.enhance_mode && item.enhance_mode !== 'flashcards' && item.enhance_mode !== 'course'))
      aiDots.push('#10B981');

    const accentColors: [string, string] =
      item.status === 'failed'     ? ['#EF4444', '#DC2626'] :
      item.status === 'processing' ? ['#F59E0B', '#D97706'] :
                                     ['#8B5CF6', '#6D28D9'];

    return (
      <View style={styles.tapeRow}>
        <TouchableOpacity
          style={styles.tapeRowMain}
          activeOpacity={0.78}
          onPress={() => item.status === 'done'
            ? navigation.navigate('VoiceNoteDetail', { note: item })
            : item.status === 'failed'
              ? handleRetry(item)
              : null
          }
          onLongPress={() => deleteNote(item)}
        >
          <View style={styles.tapeRail}>
            <LinearGradient colors={accentColors} style={styles.tapeOrb}>
              {item.status === 'processing'
                ? <ActivityIndicator color="#fff" size="small" />
                : <AppIcon name={item.status === 'failed' ? 'warningOutline' : 'mic'} size={14} color="#fff" />
              }
            </LinearGradient>
            <View style={[styles.tapeStem, { backgroundColor: accentColors[0] + '35' }]} />
          </View>

          <LinearGradient
            colors={isDark ? [C.surfaceWarm, C.surface] : ['#FFFFFF', C.primarySurface]}
            style={styles.tapeCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
          <View style={styles.tapeCardTop}>
            <Text style={styles.tapeTitle} numberOfLines={2}>
              {item.title || t('vn.transcript')}
            </Text>
            <View style={styles.tapeCardTopEnd}>
              <StatusBadge status={item.status} />
              {item.status === 'done' ? (
                <AppIcon name="arrowForward" size={18} color={WHISPER_COLOR} />
              ) : null}
            </View>
          </View>
          <View style={styles.tapeMetaRow}>
            {item.subject ? (
              <View style={styles.noteSubjectTag}>
                <Text style={styles.noteSubjectText}>{item.subject}</Text>
              </View>
            ) : null}
            {item.duration_s ? (
              <View style={styles.noteMetaTag}>
                <AppIcon name="timeOutline" size={11} color={C.textMuted} />
                <Text style={styles.noteMeta}>{formatDuration(item.duration_s)}</Text>
              </View>
            ) : null}
            <Text style={styles.tapeDate}>{formatDate(item.created_at)}</Text>
          </View>
          {item.transcript_preview ? (
            <Text style={styles.tapePreview} numberOfLines={2}>
              {item.transcript_preview}
            </Text>
          ) : null}
          {aiDots.length > 0 ? (
            <View style={styles.tapeAiStrip}>
              {aiDots.map((color, i) => (
                <View key={i} style={[styles.tapeAiDot, { backgroundColor: color }]} />
              ))}
              <Text style={styles.tapeAiLabel}>{isAr ? 'IA' : 'IA'}</Text>
            </View>
          ) : null}
          {item.status === 'failed' ? (
            <TouchableOpacity
              style={[styles.retryChip, { alignSelf: 'flex-start', marginTop: 8 }]}
              onPress={() => handleRetry(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppIcon name='refresh' size={11} color={WHISPER_COLOR} />
              <Text style={styles.retryChipText}>{t('vn.retry_restart').replace('🔄 ', '')}</Text>
            </TouchableOpacity>
          ) : null}
        </LinearGradient>
        </TouchableOpacity>
        <View style={styles.vaultActions}>
          <TouchableOpacity
            style={[styles.vaultActionBtn, styles.vaultEditBtn]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTitleEdit({ id: item.id, draft: item.title ?? '' });
            }}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={isAr ? 'تعديل العنوان' : 'Modifier le titre'}
          >
            <AppIcon name='pencil' size={20} color={WHISPER_COLOR} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.vaultActionBtn, styles.vaultDeleteBtn]}
            onPress={() => deleteNote(item)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={isAr ? 'حذف من الأرشيف' : 'Supprimer du coffre'}
          >
            <AppIcon name="trashOutline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Header enregistreur hero ───────────────────────────────────────────────
  const RecorderHero = () => (
    <View style={styles.heroOuter}>
      <LinearGradient
        colors={
          isRecording || isUploading
            ? (isDark ? ['#1E1040', '#130A2A', '#0D0618'] : ['#EDE9FE', '#F5F3FF', '#FAF9FF'])
            : (isDark ? [C.surfaceWarm, C.surface] : [...Gradients.brandSoft])
        }
        style={[styles.heroGradient, !isRecording && !isUploading && styles.heroGradientIdle]}
      >
        {isRecording ? (
          /* ── Enregistrement actif ── */
          <View style={styles.heroZone}>
            {/* Model badge */}
            <View style={styles.modelBadge}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
              <Text style={styles.modelBadgeText}>{isAr ? 'جاري التسجيل' : 'Enregistrement'}</Text>
            </View>

            <WaveformBars isRecording={!isPaused} />

            {/* Timer with glow */}
            <View style={styles.timerWrap}>
              <Text style={[styles.timerText, isPaused && { opacity: 0.5 }]}>
                {formatDuration(duration)}
              </Text>
              {isPaused && (
                <View style={styles.pausedBadge}>
                  <Text style={styles.pausedText}>⏸ {t('vn.paused')}</Text>
                </View>
              )}
            </View>

            <View style={styles.controlsRow}>
              <TouchableOpacity style={styles.ctrlBtn} onPress={cancelRecording}>
                <AppIcon name="trashOutline" size={20} color="#EF4444" />
              </TouchableOpacity>

              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <PulsingRings isActive={!isPaused} />
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <TouchableOpacity style={styles.stopBtn} onPress={stopAndUpload} disabled={isUploading}>
                    {isUploading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <View style={styles.stopSquare} />
                    }
                  </TouchableOpacity>
                </Animated.View>
              </View>

              <TouchableOpacity style={styles.ctrlBtn} onPress={togglePause}>
                <AppIcon name={isPaused ? 'play' : 'pause'} size={20} color={WHISPER_COLOR} />
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>
              {isPaused ? (isAr ? 'موقوف — اضغط ▶ للمتابعة' : 'Pause — Appuyer ▶ pour reprendre') : t('vn.recording')}
            </Text>

            {/* ── Live transcript ── */}
            {(liveTranscript.length > 0 || isChunking) && (
              <View style={styles.liveBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444' }} />
                  <Text style={styles.liveLabel}>{isAr ? 'نص مباشر' : 'Transcription live'}</Text>
                  {isChunking && <ActivityIndicator size="small" color={WHISPER_COLOR} style={{ marginLeft: 4 }} />}
                </View>
                <Text style={styles.liveText}>{liveTranscript || '…'}</Text>
              </View>
            )}
          </View>

        ) : isUploading ? (
          /* ── Transcription en cours ── */
          <View style={styles.heroZone}>
            <View style={styles.uploadingOrb}>
              <ActivityIndicator size="large" color={WHISPER_COLOR} />
            </View>
            <Text style={[styles.timerText, { color: WHISPER_COLOR, fontSize: 22, fontWeight: '700', letterSpacing: 0.5 }]}>
              {isAr ? 'جارٍ النسخ…' : 'Transcription…'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Text style={{ fontSize: 12, color: WHISPER_COLOR, fontWeight: '600' }}>🤖</Text>
              <Text style={{ fontSize: 12, color: WHISPER_COLOR, fontWeight: '600' }}>{isAr ? 'تحليل صوتي' : 'Analyse audio'}</Text>
              <Text style={{ fontSize: 12, color: C.textMuted }}>→</Text>
              <Text style={{ fontSize: 12, color: WHISPER_COLOR, fontWeight: '600' }}>{isAr ? 'نص' : 'Texte'}</Text>
            </View>
            <Text style={styles.hint}>{isAr ? 'يستغرق هذا بضع ثوانٍ…' : 'Quelques secondes…'}</Text>
          </View>

        ) : (
          /* ── Repos — bento asymétrique + carrousel modèles ── */
          <View style={styles.idleZone}>
            <Text style={styles.studioKicker}>
              {isAr ? 'وضع الإنشاء' : 'Mode création'}
            </Text>

            <View style={styles.bentoTop}>
              <View style={styles.bentoMicWrap}>
                <View style={styles.recordArea}>
                  <View style={styles.recordRing}>
                    <View style={styles.recordRingInner}>
                      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <TouchableOpacity onPress={startRecording} activeOpacity={0.85} style={styles.recordBtnShadow}>
                          <LinearGradient
                            colors={['#F87171', RECORD_COLOR, '#DC2626']}
                            style={styles.recordBtn}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                          >
                            <AppIcon name='mic' size={34} color="#fff" />
                          </LinearGradient>
                        </TouchableOpacity>
                      </Animated.View>
                    </View>
                  </View>
                  <Text style={styles.recordAreaLabel}>
                    {isAr ? 'تسجيل' : 'Enregistrer'}
                  </Text>
                </View>
              </View>

              <View style={styles.bentoStack}>
                <TouchableOpacity
                  style={styles.importCard}
                  onPress={uploadFromLibrary}
                  disabled={isUploading}
                  activeOpacity={0.78}
                >
                  <LinearGradient
                    colors={[C.primary + '22', C.accent + '18']}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  {isUploading
                    ? <ActivityIndicator size="small" color={WHISPER_COLOR} />
                    : <AppIcon name="layersOutline" size={26} color={WHISPER_COLOR} />
                  }
                  <Text style={styles.importCardTitle}>
                    {isAr ? 'رفع ملف' : 'Fichier audio'}
                  </Text>
                  <Text style={styles.importCardSub}>
                    {isAr ? 'm4a · mp3 · wav' : 'm4a · mp3 · wav'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.titleInputWrap}>
              <AppIcon name="textOutline" size={16} color={C.textMuted} style={{ marginLeft: Spacing.sm }} />
              <TextInput
                style={styles.metaInput}
                placeholder={t('vn.title_placeholder')}
                placeholderTextColor={C.textMuted}
                value={title}
                onChangeText={setTitle}
              />
              {!!title && (
                <TouchableOpacity onPress={() => setTitle('')} style={{ marginRight: Spacing.sm }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <AppIcon name="closeCircle" size={18} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ width: '100%', gap: 6 }}>
              <Text style={styles.idleSectionLabelMuted}>📚 {isAr ? 'المادة' : 'Matière'}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ width: '100%', flexGrow: 0 }}
                contentContainerStyle={{ gap: 8, flexDirection: 'row', paddingHorizontal: 2 }}
              >
                {QUICK_SUBJECTS.map(s => (
                  <TouchableOpacity
                    key={s.label}
                    style={[styles.subjectChip, subject === s.label && styles.subjectChipActive]}
                    onPress={() => setSubject(subject === s.label ? '' : s.label)}
                  >
                    <Text style={styles.subjectIcon}>{s.icon}</Text>
                    <Text style={[styles.subjectChipText, subject === s.label && styles.subjectChipTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={styles.idleSectionLabelMuted}>🤖 {isAr ? 'محرك النسخ' : 'Moteur'}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={148}
              snapToAlignment="start"
              contentContainerStyle={styles.modelCarouselContent}
            >
              {(() => {
                const whisper = getPaygFeature('whisper_studio');
                const priceByModel: Record<string, number> = {};
                for (const p of whisper?.pricing ?? []) {
                  if (p.unit === 'per_minute' && typeof p.priceMru === 'number') priceByModel[p.modelKey] = p.priceMru;
                }
                const fmt = (n: number) => (n < 0.1 ? n.toFixed(3) : n.toFixed(2)).replace(/0+$/, '').replace(/\.$/, '');
                const models = [
                  { key: 'gpt-4o-transcribe',      label: 'GPT-4o',      badge: '⭐', color: '#6366F1', desc: isAr ? 'أعلى جودة'  : 'Top qualité' },
                  { key: 'gpt-4o-mini-transcribe', label: 'GPT-4o Mini', badge: '⚡', color: '#8B5CF6', desc: isAr ? 'اقتصادي'   : 'Économique' },
                  { key: 'groq-whisper',           label: 'Groq',        badge: '🔊', color: '#10B981', desc: isAr ? 'سريع'      : 'Rapide' },
                  { key: 'google-chirp',           label: 'Chirp 2',     badge: '🔵', color: '#0EA5E9', desc: isAr ? 'جوجل'      : 'Google' },
                ] as const;

                return models.map((m) => {
                const active = transcriptionModel === m.key;
                const price = priceByModel[m.key] ?? null;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.modelCarouselCard, active && { borderColor: m.color, backgroundColor: m.color + '20' }]}
                    onPress={() => setTranscriptionModel(m.key)}
                  >
                    <Text style={styles.modelCarouselBadge}>{m.badge}</Text>
                    <Text style={[styles.modelCarouselLabel, active && { color: m.color }]}>{m.label}</Text>
                    <Text style={[styles.modelCarouselDesc, active && { color: m.color }]}>{m.desc}</Text>
                    <Text style={[styles.modelCarouselPrice, active && { color: m.color }]}>
                      {price == null ? '—' : fmt(price)} MRU/min
                    </Text>
                  </TouchableOpacity>
                );
                });
              })()}
            </ScrollView>

            <View style={styles.langDiarizeRow}>
              <View style={styles.langBlock}>
                <Text style={styles.idleSectionLabelMuted}>🌐 {isAr ? 'اللغة' : 'Langue'}</Text>
                <View style={styles.segmentControl}>
                  {(['ar', 'fr'] as const).map(l => (
                    <TouchableOpacity
                      key={l}
                      style={[styles.segmentBtn, lang2 === l && styles.segmentBtnActive]}
                      onPress={() => setLang2(l)}
                    >
                      <Text style={[styles.segmentBtnText, lang2 === l && styles.segmentBtnTextActive]}>
                        {l === 'ar' ? '🇲🇷  ' + t('vn.lang.ar') : '🇫🇷  ' + t('vn.lang.fr')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TouchableOpacity
                style={[styles.diarizeCompact, diarize && styles.diarizeCompactActive]}
                onPress={() => setDiarize(d => !d)}
              >
                <AppIcon name={diarize ? 'people' : 'peopleOutline'} size={20} color={diarize ? '#fff' : C.textMuted} />
                <Text style={[styles.diarizeCompactText, diarize && { color: '#fff' }]}>
                  {isAr ? 'متحدثون' : 'Speakers'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );

  const showStudio = homeTab === 'studio' || isRecording || isUploading;

  const vaultStatsHeader =
    notes.length > 2 && !search ? (
      <View style={styles.statsRowWrap}>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{notes.filter(n => n.status === 'done').length}</Text>
            <Text style={styles.statLabel}>{isAr ? 'منجز' : 'Traités'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>
              {Math.round(notes.reduce((acc, n) => acc + (n.duration_s ?? 0), 0) / 60)}
            </Text>
            <Text style={styles.statLabel}>{isAr ? 'دقيقة' : 'min'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>
              {notes.filter(n => n.deck_id || n.ai_course || n.clean_transcript).length}
            </Text>
            <Text style={styles.statLabel}>{isAr ? 'مع IA' : 'Enrichis IA'}</Text>
          </View>
        </View>
      </View>
    ) : null;

  // ── UI principale ──────────────────────────────────────────────────────────
  return (
    <PremiumGate
      featureKey="whisper_studio"
      loading={premiumLoading}
      hasAccess={hasAccess}
      balanceMru={balanceMru}
      navigation={navigation}
      lang={lang}
    >
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Carte Whisper : léger dégradé + ombre, crédit aligné à droite, onglets type « hero » (pilule blanche / violet) */}
      <View style={styles.headerWrap}>
        <View style={styles.headerCardOuter}>
          <LinearGradient
            colors={
              isDark
                ? ['#2D2654', '#221C42', '#18132E']
                : ['#FFFFFF', '#FAF7FF', '#FDF2F8']
            }
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCardGrad}
          >
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                onPress={() => safeBack(navigation as any)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.headerBackGlass}
              >
                <AppIcon name="arrowBack"
                  size={20}
                  color={isDark ? '#FFFFFF' : WHISPER_COLOR}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.walletChip, styles.walletChipEnd]}
                onPress={refetchBalance}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.75}
                accessibilityLabel={isAr ? 'رصيد المحفظة' : 'Solde portefeuille'}
              >
                <LinearGradient
                  colors={balanceMru > 100 ? ['#8B5CF6', '#6D28D9'] : balanceMru > 0 ? ['#F59E0B', '#D97706'] : ['#EF4444', '#B91C1C']}
                  style={styles.walletChipGrad}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <AppIcon name='wallet' size={16} color="rgba(255,255,255,0.95)" />
                  <Text style={styles.walletChipAmount} numberOfLines={1}>
                    {balanceMru >= 999990
                      ? '∞'
                      : balanceMru.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                    <Text style={styles.walletChipCur}> MRU</Text>
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.headerTabsBlock}>
              <Text style={styles.headerWordmarkCard}>{isAr ? 'ويسبر' : 'WHISPER'}</Text>
              <View style={styles.homeTabRowCard}>
                <TouchableOpacity
                  style={[styles.homeTabCard, showStudio && styles.homeTabCardOn]}
                  onPress={() => {
                    if (!isRecording && !isUploading) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setHomeTab('studio');
                    }
                  }}
                  activeOpacity={0.85}
                  disabled={isRecording || isUploading}
                >
                  <AppIcon name='sparkles'
                    size={15}
                    color={showStudio ? WHISPER_COLOR : (isDark ? 'rgba(255,255,255,0.78)' : C.textSecondary)}
                  />
                  <Text style={[styles.homeTabLabelCard, showStudio && styles.homeTabLabelCardOn]}>
                    {isAr ? 'استوديو' : 'Studio'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.homeTabCard, homeTab === 'vault' && !showStudio && styles.homeTabCardOn]}
                  onPress={() => {
                    if (!isRecording && !isUploading) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setHomeTab('vault');
                    }
                  }}
                  activeOpacity={0.85}
                  disabled={isRecording || isUploading}
                >
                  <AppIcon name="albumsOutline"
                    size={15}
                    color={homeTab === 'vault' && !showStudio ? WHISPER_COLOR : (isDark ? 'rgba(255,255,255,0.78)' : C.textSecondary)}
                  />
                  <Text style={[styles.homeTabLabelCard, homeTab === 'vault' && !showStudio && styles.homeTabLabelCardOn]}>
                    {isAr ? 'الأرشيف' : 'Coffre'}
                  </Text>
                  {notes.length > 0 ? (
                    <View style={[
                      styles.homeTabCountCard,
                      homeTab === 'vault' && !showStudio && styles.homeTabCountCardActive,
                    ]}
                    >
                      <Text style={[
                        styles.homeTabCountTextCard,
                        homeTab === 'vault' && !showStudio && styles.homeTabCountTextCardActive,
                      ]}
                      >
                        {notes.length > 99 ? '99+' : notes.length}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>

      {showStudio ? (
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 28 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <RecorderHero />
        </ScrollView>
      ) : (
        <>
          {notes.length > 0 ? (
            <View style={styles.vaultChrome}>
              <View style={styles.vaultHead}>
                <View>
                  <Text style={styles.vaultTitle}>{isAr ? 'أرشيفك' : 'Ton coffre'}</Text>
                  <Text style={styles.vaultSub}>
                    {filteredNotes.length}{search ? ` / ${notes.length}` : ''} {isAr ? 'عنصر' : 'prises'}
                    {notes.some(n => n.status === 'processing')
                      ? ` · ${isAr ? 'جاري المعالجة' : 'en cours'}`
                      : ''}
                  </Text>
                </View>
                {notes.some(n => n.status === 'processing') ? (
                  <View style={styles.processingPill}>
                    <ActivityIndicator size="small" color="#F59E0B" style={{ transform: [{ scale: 0.7 }] }} />
                    <Text style={styles.processingPillText}>
                      {notes.filter(n => n.status === 'processing').length}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.searchBar}>
                <AppIcon name='search' size={16} color={C.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('vn.search_placeholder')}
                  placeholderTextColor={C.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  clearButtonMode="while-editing"
                  returnKeyType='search'
                />
                {!!search && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <AppIcon name="closeCircle" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : null}
          <FlatList
            style={styles.vaultList}
            data={filteredNotes}
            keyExtractor={n => n.id}
            renderItem={renderNote}
            ListHeaderComponent={vaultStatsHeader}
            ListEmptyComponent={
              loadingList ? (
                <View style={{ alignItems: 'center', paddingTop: 50, gap: 12 }}>
                  <ActivityIndicator color={WHISPER_COLOR} size="large" />
                  <Text style={{ color: C.textMuted, fontSize: 13 }}>{isAr ? 'جاري التحميل…' : 'Chargement…'}</Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={styles.emptyIconWrap}>
                    <AppIcon name='mic' size={34} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.emptyTitle}>{t('vn.empty_title')}</Text>
                  <Text style={styles.emptySub}>{t('vn.empty_sub')}</Text>
                  <TouchableOpacity
                    style={styles.emptyJumpStudio}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setHomeTab('studio');
                    }}
                  >
                    <LinearGradient colors={[...Gradients.violet]} style={styles.emptyJumpStudioGrad}>
                      <AppIcon name='flash' size={18} color="#fff" />
                      <Text style={styles.emptyJumpStudioText}>
                        {isAr ? 'اذهب للاستوديو' : 'Ouvrir le studio'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <View style={styles.emptyTips}>
                    {[
                      { icon: '🎤', text: isAr ? 'سجّل محاضرتك واحصل على نص فوري' : 'Enregistre ton cours, obtiens le texte instantanément' },
                      { icon: '✨', text: isAr ? 'ملخص وبطاقات من تبويب التفاصيل' : 'Résumé & flashcards depuis le détail' },
                      { icon: '📂', text: isAr ? 'استورد ملفات صوتية' : 'Importe des fichiers audio' },
                    ].map((tip, i) => (
                      <View key={i} style={styles.emptyTip}>
                        <Text style={{ fontSize: 16 }}>{tip.icon}</Text>
                        <Text style={styles.emptyTipText}>{tip.text}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )
            }
            contentContainerStyle={{
              paddingHorizontal: Spacing.base,
              paddingBottom: Math.max(insets.bottom, 16) + 32,
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <Modal
        visible={!!titleEdit}
        transparent
        animationType="fade"
        onRequestClose={() => !titleEditSaving && setTitleEdit(null)}
      >
        <KeyboardAvoidingView
          style={styles.titleEditOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => !titleEditSaving && setTitleEdit(null)}
            accessibilityRole="button"
            accessibilityLabel={t('vn.cancel')}
          />
          <View style={styles.titleEditCard}>
            <Text style={styles.titleEditHeading}>{t('vn.title_edit_modal')}</Text>
            <TextInput
              style={styles.titleEditInput}
              value={titleEdit?.draft ?? ''}
              onChangeText={text => setTitleEdit(prev => (prev ? { ...prev, draft: text } : null))}
              placeholder={t('vn.title_placeholder')}
              placeholderTextColor={C.textMuted}
              maxLength={200}
              editable={!titleEditSaving}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => titleEdit && !titleEditSaving && saveNoteTitle(titleEdit.id, titleEdit.draft)}
            />
            <View style={styles.titleEditActions}>
              <TouchableOpacity
                style={[styles.titleEditBtn, styles.titleEditBtnGhost]}
                onPress={() => !titleEditSaving && setTitleEdit(null)}
                disabled={titleEditSaving}
              >
                <Text style={styles.titleEditBtnGhostText}>{t('vn.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.titleEditBtn, styles.titleEditBtnPrimary]}
                onPress={() => titleEdit && saveNoteTitle(titleEdit.id, titleEdit.draft)}
                disabled={titleEditSaving}
              >
                {titleEditSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.titleEditBtnPrimaryText}>{t('vn.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
    </PremiumGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: typeof Colors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },

    // ── Wallet chip (header, une ligne — aligné au bouton retour) ───────────
    walletChip: { maxWidth: 160, flexShrink: 0 },
    walletChipEnd: { marginStart: 'auto' },
    walletChipGrad: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 40,
      paddingHorizontal: 12,
      paddingVertical: 0,
      borderRadius: BorderRadius.md,
    },
    walletChipAmount: {
      flexShrink: 1,
      fontSize: 14,
      fontWeight: '800',
      color: '#fff',
      lineHeight: 18,
    },
    walletChipCur: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.88)' },

    // ── Header carte Whisper (dégradé doux + onglets pilule blanche / violet) ───
    headerWrap: {
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.md,
      backgroundColor: C.background,
    },
    headerCardOuter: {
      marginHorizontal: Spacing.base,
      borderRadius: BorderRadius.xl,
      overflow: 'hidden',
      ...Shadows.sm,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(167,139,250,0.28)' : 'rgba(124,58,237,0.16)',
    },
    headerCardGrad: {
      borderRadius: BorderRadius.xl,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.md,
      gap: Spacing.md,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
    },
    headerBackGlass: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(124,58,237,0.28)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTabsBlock: {
      width: '100%',
      alignItems: 'center',
      gap: 8,
    },
    headerWordmarkCard: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 2.6,
      color: isDark ? 'rgba(255,255,255,0.9)' : WHISPER_COLOR,
    },
    homeTabRowCard: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      backgroundColor: isDark ? 'rgba(0,0,0,0.32)' : 'rgba(124,58,237,0.1)',
      borderRadius: BorderRadius.pill,
      padding: 4,
      gap: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(124,58,237,0.16)',
    },
    homeTabCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: BorderRadius.pill,
    },
    homeTabCardOn: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.94)' : '#FFFFFF',
      ...Shadows.sm,
    },
    homeTabLabelCard: {
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? 'rgba(255,255,255,0.88)' : C.textSecondary,
    },
    homeTabLabelCardOn: { color: WHISPER_COLOR },
    homeTabCountCard: {
      marginStart: 4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(124,58,237,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    homeTabCountCardActive: {
      backgroundColor: WHISPER_COLOR + '22',
    },
    homeTabCountTextCard: {
      fontSize: 9,
      fontWeight: '900',
      color: isDark ? 'rgba(255,255,255,0.95)' : WHISPER_COLOR,
    },
    homeTabCountTextCardActive: { color: WHISPER_COLOR },
    mainScroll: { flex: 1 },
    vaultChrome: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    vaultHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    vaultTitle: { fontSize: 22, fontWeight: '900', color: C.textPrimary, letterSpacing: -0.5 },
    vaultSub: { fontSize: 12, color: C.textMuted, marginTop: 2, fontWeight: '600' },
    vaultList: { flex: 1 },
    statsRowWrap: { marginBottom: Spacing.md },

    // ── Model badge (during recording) ─────────────────────────────────────
    modelBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: 'rgba(239,68,68,0.15)',
      paddingHorizontal: 12, paddingVertical: 5,
      borderRadius: 20, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    },
    modelBadgeText: { fontSize: 11, fontWeight: '700', color: '#EF4444', letterSpacing: 0.3 },

    // ── Timer wrap ───────────────────────────────────────────────────────
    timerWrap: { alignItems: 'center', gap: 6 },

    // ── Hero (enregistrement / carte studio) ───────────────────────────────
    heroOuter: { marginBottom: 4 },
    heroGradient: {
      borderRadius: BorderRadius.xl,
      padding: Spacing.base,
      alignItems: 'center',
      overflow: 'hidden',
    },
    heroGradientIdle: {
      borderWidth: 1,
      borderColor: C.border,
      ...Shadows.md,
    },
    heroZone:  { alignItems: 'center', gap: 16, paddingVertical: 8 },
    idleZone:  { width: '100%', alignItems: 'stretch', gap: Spacing.md },
    studioKicker: {
      alignSelf: 'center',
      fontSize: 10,
      fontWeight: '800',
      color: C.textMuted,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    bentoTop: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: Spacing.md,
      width: '100%',
    },
    bentoMicWrap: {
      flex: 1.15,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
    },
    bentoStack: {
      flex: 0.95,
      minWidth: 0,
      justifyContent: 'center',
    },
    importCard: {
      flex: 1,
      minHeight: 168,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: C.primary + '44',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      overflow: 'hidden',
      backgroundColor: C.surface,
    },
    importCardTitle: { fontSize: 14, fontWeight: '800', color: C.primary, marginTop: 4 },
    importCardSub: { fontSize: 10, fontWeight: '600', color: C.textMuted },
    modelCarouselContent: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 4,
      paddingRight: Spacing.base,
    },
    modelCarouselCard: {
      width: 138,
      padding: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: C.surface,
      borderWidth: 1.5,
      borderColor: C.border,
      gap: 4,
    },
    modelCarouselBadge: { fontSize: 16 },
    modelCarouselLabel: { fontSize: 13, fontWeight: '800', color: C.textPrimary },
    modelCarouselDesc: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
    modelCarouselPrice: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginTop: 4 },
    langDiarizeRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: Spacing.sm,
      width: '100%',
    },
    langBlock: { flex: 1, minWidth: 0, gap: 6 },
    diarizeCompact: {
      width: 96,
      borderRadius: BorderRadius.md,
      backgroundColor: C.surfaceVariant,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: Spacing.sm,
    },
    diarizeCompactActive: {
      backgroundColor: WHISPER_COLOR,
      borderColor: WHISPER_COLOR,
      ...Shadows.brand,
    },
    diarizeCompactText: {
      fontSize: 10,
      fontWeight: '800',
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // Recording
    timerText: {
      fontSize: 58,
      fontWeight: '100',
      color: C.textPrimary,
      letterSpacing: 4,
      fontVariant: ['tabular-nums'],
    },
    pausedBadge: {
      backgroundColor: '#F59E0B20',
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderRadius: 20,
    },
    pausedText: { color: '#F59E0B', fontSize: 13, fontWeight: '700' },
    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 36, marginTop: 4 },
    ctrlBtn: {
      width: 54, height: 54, borderRadius: 27,
      backgroundColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    },
    stopBtn: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: RECORD_COLOR,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: RECORD_COLOR,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.55, shadowRadius: 18, elevation: 14,
    },
    stopSquare: { width: 26, height: 26, borderRadius: 6, backgroundColor: '#fff' },
    hint: { fontSize: 12, color: C.textMuted, textAlign: 'center' },

    // Uploading
    uploadingOrb: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: WHISPER_COLOR + '14',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: WHISPER_COLOR + '40',
    },

    // ── Title input row ────────────────────────────────────────────────────
    titleInputWrap: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surfaceVariant,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: C.border,
    },
    metaInput: {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 12,
      color: C.textPrimary,
      fontSize: 14,
    },

    // ── Section label inside idle zone ─────────────────────────────────────
    idleSectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: C.textPrimary,
      letterSpacing: 0.4,
      paddingHorizontal: 2,
      alignSelf: 'flex-start',
    },
    idleSectionLabelMuted: {
      fontSize: 10,
      fontWeight: '700',
      color: C.textMuted,
      letterSpacing: 0.35,
      textTransform: 'uppercase',
      paddingHorizontal: 2,
      alignSelf: 'flex-start',
    },

    // ── Subject chips ──────────────────────────────────────────────────────
    subjectChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.pill,
      backgroundColor: C.surface,
      borderWidth: 1, borderColor: C.border,
    },
    subjectChipActive: { backgroundColor: WHISPER_COLOR + '22', borderColor: WHISPER_COLOR },
    subjectIcon: { fontSize: 14 },
    subjectChipText: { fontSize: 12, color: C.textSecondary },
    subjectChipTextActive: { color: WHISPER_COLOR, fontWeight: '700' },

    // ── Segment control (langue) ───────────────────────────────────────────
    segmentControl: {
      flexDirection: 'row',
      backgroundColor: C.surfaceVariant,
      borderRadius: BorderRadius.md,
      padding: 3,
      width: '100%',
      borderWidth: 1,
      borderColor: C.border,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 9,
      alignItems: 'center',
      borderRadius: 11,
    },
    segmentBtnActive: {
      backgroundColor: WHISPER_COLOR,
      shadowColor: WHISPER_COLOR,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    segmentBtnText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
    segmentBtnTextActive: { color: '#fff', fontWeight: '700' },

    // ── Record area with outer ring ────────────────────────────────────────
    recordArea: { alignItems: 'center', gap: 10, paddingVertical: 4 },
    recordRing: {
      width: 140, height: 140,
      borderRadius: 70,
      borderWidth: 1.5,
      borderColor: RECORD_COLOR + '30',
      alignItems: 'center', justifyContent: 'center',
    },
    recordRingInner: {
      width: 118, height: 118,
      borderRadius: 59,
      borderWidth: 1.5,
      borderColor: RECORD_COLOR + '55',
      alignItems: 'center', justifyContent: 'center',
    },
    recordAreaLabel: {
      fontSize: 12,
      color: C.textMuted,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    recordBtnShadow: {
      shadowColor: RECORD_COLOR,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.55, shadowRadius: 22, elevation: 16,
    },
    recordBtn: {
      width: 96, height: 96, borderRadius: 48,
      alignItems: 'center', justifyContent: 'center',
    },

    processingPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#F59E0B18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    },
    processingPillText: { fontSize: 10, color: '#F59E0B', fontWeight: '700' },

    // ── Liste « timeline » (Coffre) ────────────────────────────────────────
    tapeRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 6,
      marginBottom: Spacing.md,
    },
    tapeRowMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
      minWidth: 0,
    },
    vaultActions: {
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'stretch',
      gap: 8,
      paddingLeft: 2,
    },
    vaultActionBtn: {
      justifyContent: 'center',
      alignItems: 'center',
      width: 44,
      height: 44,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
    },
    vaultEditBtn: {
      backgroundColor: WHISPER_COLOR + '14',
      borderColor: WHISPER_COLOR + '38',
    },
    vaultDeleteBtn: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : '#FEE2E2',
      borderColor: isDark ? 'rgba(239,68,68,0.35)' : '#FECACA',
    },

    titleEditOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    titleEditCard: {
      backgroundColor: C.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: C.border,
      ...Shadows.md,
    },
    titleEditHeading: {
      fontSize: 18,
      fontWeight: '800',
      color: C.textPrimary,
    },
    titleEditInput: {
      marginTop: Spacing.md,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: C.textPrimary,
      backgroundColor: C.surfaceVariant,
    },
    titleEditActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: Spacing.lg,
    },
    titleEditBtn: {
      minWidth: 100,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleEditBtnGhost: {
      backgroundColor: C.surfaceVariant,
      borderWidth: 1,
      borderColor: C.border,
    },
    titleEditBtnGhostText: {
      fontSize: 15,
      fontWeight: '700',
      color: C.textSecondary,
    },
    titleEditBtnPrimary: {
      backgroundColor: WHISPER_COLOR,
    },
    titleEditBtnPrimaryText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
    tapeRail: { width: 36, alignItems: 'center' },
    tapeOrb: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.sm,
    },
    tapeStem: {
      flex: 1,
      width: 3,
      marginTop: 4,
      borderRadius: 2,
      minHeight: 12,
    },
    tapeCard: {
      flex: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: C.border,
      ...Shadows.sm,
    },
    tapeCardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      marginBottom: 6,
    },
    tapeCardTopEnd: { alignItems: 'flex-end', gap: 6 },
    tapeTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: C.textPrimary, lineHeight: 22 },
    tapeMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
    },
    tapeDate: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
    tapePreview: { fontSize: 12, color: C.textSecondary, lineHeight: 18, marginTop: 6 },
    tapeAiStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 8,
    },
    tapeAiDot: { width: 7, height: 7, borderRadius: 4 },
    tapeAiLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5 },

    noteSubjectTag:  {
      backgroundColor: WHISPER_COLOR + '15',
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    },
    noteSubjectText: { fontSize: 10, color: WHISPER_COLOR, fontWeight: '700' },
    noteMetaTag:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
    noteMeta:        { fontSize: 10, color: C.textMuted },
    notePreview:     { fontSize: 12, color: C.textSecondary, lineHeight: 17, marginTop: 1 },

    // ── Stats bar ───────────────────────────────────────────────────────
    statsRow: {
      flexDirection: 'row',
      backgroundColor: C.surfaceVariant,
      borderRadius: BorderRadius.md,
      marginBottom: 0,
      paddingVertical: Spacing.sm,
      borderWidth: 1, borderColor: C.border,
    },
    statCell: { flex: 1, alignItems: 'center', gap: 2 },
    statValue: { fontSize: 18, fontWeight: '800', color: WHISPER_COLOR },
    statLabel: { fontSize: 10, color: C.textMuted, fontWeight: '500' },
    statDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },

    // ── Empty state ────────────────────────────────────────────────────────
    emptyState: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
    emptyIconWrap: {
      width: 72, height: 72, borderRadius: 24,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 18,
      shadowColor: WHISPER_COLOR,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary, marginBottom: 6 },
    emptySub:   { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    emptyTips: { width: '100%', gap: 10 },
    emptyTip: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: C.border,
    },
    emptyTipText: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 18 },
    emptyJumpStudio: {
      alignSelf: 'stretch',
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.md,
      borderRadius: BorderRadius.md,
      overflow: 'hidden',
      ...Shadows.brand,
    },
    emptyJumpStudioGrad: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: Spacing.base,
    },
    emptyJumpStudioText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    // ── Retry chip (failed notes) ──────────────────────────────────────────
    retryChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#EDE9FE', borderRadius: 10,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    retryChipText: { fontSize: 11, fontWeight: '700', color: WHISPER_COLOR },

    // ── Search bar ─────────────────────────────────────────────────────────
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: C.surfaceVariant,
      borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10,
      marginBottom: 0,
      borderWidth: 1, borderColor: C.border,
    },
    searchInput: {
      flex: 1, fontSize: 14, color: C.textPrimary, padding: 0,
    },

    // ── Live transcript ────────────────────────────────────────────────────
    liveBox: {
      width: '100%',
      backgroundColor: 'rgba(239,68,68,0.07)',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.2)',
      padding: 12,
      marginTop: 8,
    },
    liveLabel: {
      fontSize: 10, fontWeight: '800', color: '#EF4444',
      textTransform: 'uppercase', letterSpacing: 1,
    },
    liveText: {
      fontSize: 13, color: C.textPrimary, lineHeight: 21,
    },
  });
}

