/**
 * 🍅 PomodoroScreen — Focus Mode
 *
 * Inspired by Forest (China #1 productivity app, 50M+ users) &
 * the Pomodoro Technique (25 min focus / 5 min break).
 *
 * Features:
 *  - Pure-RN circular progress ring (no SVG library needed)
 *  - Work ↔ Break auto-switching with haptics + local notification
 *  - AppState sync: recalculates remaining time when app returns to foreground
 *  - Saves focus minutes to AsyncStorage per day
 *  - Today's cumulative focus time shown inside the ring
 *  - Session dot counter (like Pomodoro tomato icons)
 *  - Subject picker with quick chips
 */

import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, TouchableOpacity, AppState, AppStateStatus, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Colors, Spacing, BorderRadius } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { logFocusMinutes, getTodayFocusMinutes } from '../../utils/offlineStorage';
import { safeBack } from '../../utils/safeBack';

const WORK_SECS  = 25 * 60;  // 25 minutes
const BREAK_SECS = 5  * 60;  //  5 minutes

const SUBJECTS_AR = ['الرياضيات', 'الفيزياء', 'الكيمياء', 'اللغة العربية', 'الإنجليزية', 'البرمجة', 'الاقتصاد', 'القانون'];
const SUBJECTS_FR = ['Maths', 'Physique', 'Chimie', 'Arabe', 'Anglais', 'Info', 'Économie', 'Droit'];

const fmt = (secs: number) =>
  `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;

// ── Pure-RN Circular Progress Ring ─────────────────────────────────────────
// Uses the "split-circle clip" technique — two half-circle overflow:hidden
// containers, each containing a rotated full ring, creating a smooth arc.
//
// Math:
//   rightAngle = (progress - 0.5) * 360   for progress ∈ [0, 0.5]  → -180° to 0°
//   leftAngle  = 180 - (progress - 0.5) * 360  for progress ∈ (0.5, 1] → 180° to 0°
//
// At progress=0: nothing visible. At progress=1: full ring visible.
const ProgressRing = React.memo(({
  progress, size, color, strokeWidth = 14,
}: {
  progress: number; size: number; color: string; strokeWidth?: number;
}) => {
  const half = size / 2;
  const p = Math.max(0, Math.min(1, progress));
  const rightAngle = p <= 0.5 ? (p - 0.5) * 360 : 0;
  const leftAngle  = p >  0.5 ? 180 - (p - 0.5) * 360 : 180;
  return (
    <View style={{ width: size, height: size }}>
      {/* Gray track */}
      <View style={{
        position: 'absolute', top: 0, left: 0,
        width: size, height: size, borderRadius: half,
        borderWidth: strokeWidth, borderColor: '#E5E7EB',
      }} />
      {/* Right half — fills first 50% */}
      <View style={{ position: 'absolute', top: 0, right: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={{
          position: 'absolute', top: 0, left: -half,
          width: size, height: size, borderRadius: half,
          borderWidth: strokeWidth, borderColor: color,
          transform: [{ rotate: `${rightAngle}deg` }],
        }} />
      </View>
      {/* Left half — fills second 50% */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={{
          position: 'absolute', top: 0, left: 0,
          width: size, height: size, borderRadius: half,
          borderWidth: strokeWidth, borderColor: color,
          transform: [{ rotate: `${leftAngle}deg` }],
        }} />
      </View>
    </View>
  );
});

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function PomodoroScreen() {
  const navigation = useNavigation();
  const { colors: C } = useTheme();
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const [timeLeft,   setTimeLeft]   = useState(WORK_SECS);
  const [isRunning,  setIsRunning]  = useState(false);
  const [isBreak,    setIsBreak]    = useState(false);
  const [sessions,   setSessions]   = useState(0);
  const [todayFocus, setTodayFocus] = useState(0);
  const [subject,    setSubject]    = useState('');

  // Refs — avoid stale closure issues in callbacks
  const isBreakRef        = useRef(false);
  const sessionEndTimeRef = useRef(0);
  const notifIdRef        = useRef<string | null>(null);
  const appStateRef       = useRef<AppStateStatus>(AppState.currentState);

  // Keep ref in sync
  useEffect(() => { isBreakRef.current = isBreak; }, [isBreak]);

  // Load today's focus on mount
  useEffect(() => {
    getTodayFocusMinutes().then(setTodayFocus).catch(() => {});
  }, []);

  // AppState: resync timer when app comes back from background
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        if (sessionEndTimeRef.current > 0) {
          const remaining = Math.max(0, Math.round((sessionEndTimeRef.current - Date.now()) / 1000));
          setTimeLeft(remaining);
          // If remaining hit 0 in background, handleComplete will fire via the countdown effect
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // Cancel scheduled notification helper
  const cancelNotif = useCallback(async () => {
    if (notifIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(notifIdRef.current).catch(() => {});
      notifIdRef.current = null;
    }
  }, []);

  // Called when timer reaches 0
  const handleComplete = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await cancelNotif();
    sessionEndTimeRef.current = 0;
    const wasBreak = isBreakRef.current;
    if (!wasBreak) {
      const mins = WORK_SECS / 60;
      await logFocusMinutes(mins).catch(() => {});
      setTodayFocus(prev => prev + mins);
      setSessions(prev => prev + 1);
    }
    setIsRunning(false);
    // Toggle mode
    const nextIsBreak = !wasBreak;
    isBreakRef.current = nextIsBreak;
    setIsBreak(nextIsBreak);
    setTimeLeft(nextIsBreak ? BREAK_SECS : WORK_SECS);
  }, [cancelNotif]);

  // Countdown engine — uses setTimeout for clean state management
  useEffect(() => {
    if (!isRunning) return;
    if (timeLeft <= 0) { handleComplete(); return; }
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [isRunning, timeLeft, handleComplete]);

  const handlePlay = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sessionEndTimeRef.current = Date.now() + timeLeft * 1000;
    // Schedule background notification (best-effort — permissions may not be granted)
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: isBreak
            ? t('pomo.break_end')
            : t('pomo.focus_done'),
          body: t('pomo.break_done'),
          sound: true,
        },
        trigger: { seconds: timeLeft, repeats: false } as any,
      });
      notifIdRef.current = id;
    } catch { /* notifications not enabled — timer still works */ }
    setIsRunning(true);
  }, [timeLeft, isBreak, isAr]);

  const handlePause = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await cancelNotif();
    sessionEndTimeRef.current = 0;
    setIsRunning(false);
  }, [cancelNotif]);

  const handleReset = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await cancelNotif();
    sessionEndTimeRef.current = 0;
    setIsRunning(false);
    setTimeLeft(isBreak ? BREAK_SECS : WORK_SECS);
  }, [isBreak, cancelNotif]);

  const handleSwitch = useCallback(async () => {
    await handleReset();
    const nextBreak = !isBreakRef.current;
    setIsBreak(nextBreak);
    setTimeLeft(nextBreak ? BREAK_SECS : WORK_SECS);
  }, [handleReset]);

  // Derived
  const total     = isBreak ? BREAK_SECS : WORK_SECS;
  const progress  = timeLeft / total;
  const ringColor = isBreak ? '#10B981' : Colors.primary;
  const subjects  = isAr ? SUBJECTS_AR : SUBJECTS_FR;
  const styles    = useMemo(() => makeStyles(C), [C]);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: ringColor }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(navigation as any)} style={styles.backBtn}>
            <AppIcon name="arrowBack" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isBreak
              ? t('pomo.break_mode')
              : t('pomo.focus_mode')}
          </Text>
          <View style={styles.sessionBadge}>
            <Text style={styles.sessionBadgeText}>🍅 ×{sessions}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', padding: Spacing.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Circular Ring + Time ───────────────────────────────────────── */}
        <View style={{ marginTop: 24, marginBottom: 32, alignItems: 'center', justifyContent: 'center' }}>
          <ProgressRing progress={progress} size={228} color={ringColor} />
          {/* Center overlay — positioned absolutely over the ring */}
          <View style={StyleSheet.absoluteFillObject as any}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[styles.timeText, { color: ringColor }]}>{fmt(timeLeft)}</Text>
              <Text style={[styles.modeLbl, { color: ringColor }]}>
              {isBreak ? t('pomo.break') : t('pomo.focus')}
              </Text>
              {todayFocus > 0 && (
                <Text style={[styles.focusToday, { color: C.textMuted }]}>
                  {isAr ? `📚 ${todayFocus} دقيقة اليوم` : `📚 ${todayFocus} min aujourd'hui`}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* ── Controls ──────────────────────────────────────────────────── */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.smBtn, { backgroundColor: C.surfaceVariant }]}
            onPress={handleReset}
          >
            <AppIcon name="refreshOutline" size={22} color={C.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: ringColor }]}
            onPress={isRunning ? handlePause : handlePlay}
            activeOpacity={0.85}
          >
            <AppIcon name={isRunning ? 'pause' : 'play'} size={34} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.smBtn, { backgroundColor: C.surfaceVariant }]}
            onPress={handleSwitch}
          >
            <AppIcon name="swapHorizontalOutline" size={22} color={C.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Session Dots ──────────────────────────────────────────────── */}
        {sessions > 0 && (
          <View style={styles.dotsRow}>
            {Array.from({ length: Math.min(sessions, 8) }).map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: ringColor }]} />
            ))}
            {sessions > 8 && (
              <Text style={{ color: C.textMuted, fontWeight: '700', fontSize: 12 }}>
                +{sessions - 8}
              </Text>
            )}
          </View>
        )}

        {/* ── Subject Picker ─────────────────────────────────────────────── */}
        <View style={{ width: '100%', marginTop: 28 }}>
          <Text style={[styles.secLabel, { color: C.textMuted }]}>
            {t('pomo.subject_label')}
          </Text>
          <TextInput
            style={[styles.subInput, {
              color: C.textPrimary,
              borderColor: subject ? ringColor : C.border,
              backgroundColor: C.surfaceWarm,
            }]}
            value={subject}
            onChangeText={setSubject}
            placeholder={t('pomo.subject_placeholder')}
            placeholderTextColor={C.textMuted}
            textAlign={isAr ? 'right' : 'left'}
            returnKeyType="done"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {subjects.map(s => {
                const active = subject === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.subChip, {
                      borderColor: active ? ringColor : C.border,
                      backgroundColor: active ? ringColor + '18' : C.surfaceVariant,
                    }]}
                    onPress={() => setSubject(active ? '' : s)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? ringColor : C.textMuted }}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* ── Tip Card ────────────────────────────────────────────────────── */}
        <View style={[styles.tipCard, { backgroundColor: ringColor + '10', borderColor: ringColor + '28' }]}>
          <AppIcon name="bulbOutline" size={18} color={ringColor} style={{ marginTop: 1 }} />
          <Text style={[styles.tipText, { color: ringColor }]}>
            {isRunning ? t('pomo.tip1') : t('pomo.tip2')}
          </Text>
        </View>

        {/* ── First-time explanation ─────────────────────────────────────── */}
        {sessions === 0 && !isRunning && (
          <View style={[styles.infoCard, { backgroundColor: C.surfaceWarm, borderColor: C.border }]}>
            <Text style={{ fontSize: 40, marginBottom: 4 }}>🍅</Text>
            <Text style={[styles.infoTitle, { color: C.textPrimary }]}>
            {t('pomo.technique')}
            </Text>
            <Text style={[styles.infoBody, { color: C.textSecondary }]}>
              {isAr
                ? '25 دقيقة تركيز كامل  →  5 دقائق راحة\nبعد 4 جلسات: راحة طويلة 20 دقيقة'
                : '25 min de concentration totale  →  5 min de pause\nAprès 4 sessions : longue pause 20 min'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              {[
                { e: '🧠', t: t('pomo.focus') },
                { e: '🔄', t: t('pomo.repetition') },
                { e: '📈', t: t('pomo.stat.progress') },
              ].map(({ e, t }) => (
                <View key={t} style={[styles.infoChip, { backgroundColor: ringColor + '15' }]}>
                  <Text style={{ fontSize: 18 }}>{e}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: ringColor }}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const makeStyles = (C: typeof Colors) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  sessionBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4,
  },
  sessionBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  timeText: { fontSize: 56, fontWeight: '900', letterSpacing: -2 },
  modeLbl:  { fontSize: 15, fontWeight: '700', marginTop: 4 },
  focusToday: { fontSize: 12, color: '#9CA3AF', marginTop: 5 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  smBtn: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
  },
  playBtn: {
    width: 82, height: 82, borderRadius: 41,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 10, elevation: 6,
  },
  dotsRow: {
    flexDirection: 'row', gap: 8, marginTop: 18,
    alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center',
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  secLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, textAlign: 'right' },
  subInput: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontWeight: '600',
  },
  subChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  tipCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 22, width: '100%', borderWidth: 1, borderRadius: 14, padding: 14,
  },
  tipText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 20 },
  infoCard: {
    marginTop: 24, width: '100%', alignItems: 'center',
    borderRadius: 20, borderWidth: 1, padding: 24, gap: 4,
  },
  infoTitle: { fontSize: 17, fontWeight: '800' },
  infoBody:  { fontSize: 13, textAlign: 'center', lineHeight: 22 },
  infoChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
    alignItems: 'center', gap: 4,
  },
});
