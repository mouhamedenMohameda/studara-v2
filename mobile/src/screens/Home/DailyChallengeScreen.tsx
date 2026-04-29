/**
 * 🎲 DailyChallengeScreen — Wordle-style Daily Quiz
 *
 * Every student in the same faculty gets IDENTICAL questions every day,
 * seeded server-side by (UTC date + faculty).  Leaderboard resets at midnight.
 *
 * Flow:
 *   Loading → Questions (5 MCQ, 60s global timer) → Result + Leaderboard
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Animated, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useAuth }         from '../../context/AuthContext';
import { useTheme }        from '../../context/ThemeContext';
import { useLanguage }     from '../../context/LanguageContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import { apiRequest }      from '../../utils/api';
import { scheduleDailyChallengeNotification, cancelDailyChallengeNotification } from '../../utils/notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Gradients } from '../../theme';
import { safeBack } from '../../utils/safeBack';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChallengeQuestion {
  id:            string;
  front:         string;
  correctAnswer: string;
  options:       string[];
  subject?:      string;
}

interface ChallengeData {
  date:              string;
  faculty:           string;
  questions:         ChallengeQuestion[];
  alreadySubmitted:  boolean;
  myScore:           { score: number; correct: number; total: number; time_taken_s: number } | null;
  timeLimitS:        number;
  notYetAvailable:   boolean;
  showFromHour:      number;
  showFromMinute:    number;
  isAdminSet:        boolean;
}

interface LeaderboardEntry {
  rank:      number;
  name:      string;
  score:     number;
  correct:   number;
  total:     number;
  timeTaken: number;
  isMe:      boolean;
}

type Phase = 'loading' | 'ready' | 'playing' | 'result' | 'error' | 'soon';

const REVEAL_DELAY = 1200; // ms before advancing to next question after answer

// ─── Score formula ─────────────────────────────────────────────────────────────
// 100 pts per correct answer + speed bonus (up to 40 pts per question)
function calcScore(correct: number, timeLeft: number, totalTime: number, total: number): number {
  const base  = correct * 100;
  const bonus = correct > 0 ? Math.round((timeLeft / totalTime) * correct * 40) : 0;
  return base + bonus;
}

export default function DailyChallengeScreen() {
  const navigation   = useNavigation<any>();
  const { token }    = useAuth();
  const { colors: C, isDark } = useTheme();
  const { lang }     = useLanguage();
  const { fontSize } = useAccessibility();
  const isAr         = lang === 'ar';

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase,       setPhase]       = useState<Phase>('loading');
  const [data,        setData]        = useState<ChallengeData | null>(null);
  const [qIndex,      setQIndex]      = useState(0);
  const [selected,    setSelected]    = useState<string | null>(null);
  const [answered,    setAnswered]    = useState<boolean[]>([]);   // true = correct
  const [timeLeft,    setTimeLeft]    = useState(60);
  const [finalScore,  setFinalScore]  = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading,   setLbLoading]   = useState(false);

  // Animated shake for wrong answer
  const shakeAnim = useRef(new Animated.Value(0)).current;
  // Timer interval ref
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load challenge ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const d = await apiRequest<ChallengeData>('/daily-challenge', { token: token! });
        setData(d);
        if (d.notYetAvailable) {
          setPhase('soon');
          // Schedule a local notification for when the challenge opens
          scheduleDailyChallengeNotification(
            d.showFromHour ?? 0,
            d.showFromMinute ?? 0,
          ).catch(() => {});
        } else if (d.alreadySubmitted && d.myScore) {
          cancelDailyChallengeNotification().catch(() => {});
          const s = d.myScore;
          setFinalScore(s.score);
          setAnswered(Array(s.total).fill(null));
          setPhase('result');
          loadLeaderboard();
        } else {
          setTimeLeft(d.timeLimitS ?? 60);
          setPhase('ready');
        }
      } catch {
        setPhase('error');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft((prev: number) => {
        if (prev <= 1) {
          stopTimer();
          // Time's up — submit whatever we have
          setPhase('result');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // When time hits 0, auto-submit
  useEffect(() => {
    if (timeLeft === 0 && phase === 'playing') {
      handleFinish(answered);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // ── Start playing ──────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const tl = data?.timeLimitS ?? 60;
    setPhase('playing');
    setQIndex(0);
    setSelected(null);
    setAnswered([]);
    setTimeLeft(tl);
    startTimer();
  }, [startTimer, data]);

  // ── Answer a question ──────────────────────────────────────────────────────
  const handleAnswer = useCallback((option: string) => {
    if (selected !== null || !data) return; // already answered
    const q          = data.questions[qIndex];
    const isCorrect  = option === q.correctAnswer;
    setSelected(option);

    if (isCorrect) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      // Shake the wrong answer
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
      ]).start();
    }

    const newAnswered = [...answered, isCorrect];

    setTimeout(() => {
      setSelected(null);
      if (qIndex + 1 >= data.questions.length) {
        stopTimer();
        handleFinish(newAnswered);
      } else {
        setQIndex(qi => qi + 1);
        setAnswered(newAnswered);
      }
    }, REVEAL_DELAY);

    setAnswered(newAnswered);
  }, [selected, data, qIndex, answered, shakeAnim, stopTimer]);

  // ── Finish & submit ────────────────────────────────────────────────────────
  const handleFinish = useCallback(async (finalAnswered: boolean[]) => {
    const correct   = finalAnswered.filter(Boolean).length;
    const tl        = timeLeft;
    const totalTime = data?.timeLimitS ?? 60;
    const score     = calcScore(correct, tl, totalTime, data?.questions.length ?? 5);
    const timeTaken = totalTime - tl;

    setFinalScore(score);
    setPhase('result');

    try {
      await apiRequest('/daily-challenge/submit', {
        method: 'POST',
        body: { score, correct, total: data?.questions.length ?? 5, time_taken_s: timeTaken },
        token: token!,
      });
    } catch {/* silent */}

    loadLeaderboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, data, token]);

  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    try {
      const lb = await apiRequest<{ entries: LeaderboardEntry[] }>(
        '/daily-challenge/leaderboard', { token: token! },
      );
      setLeaderboard(lb.entries);
    } catch {/* silent */}
    setLbLoading(false);
  }, [token]);

  // ── Timer color ────────────────────────────────────────────────────────────
  const totalTime  = data?.timeLimitS ?? 60;
  const timerColor = timeLeft > Math.floor(totalTime * 0.33) ? Colors.primary
    : timeLeft > Math.floor(totalTime * 0.17) ? '#F59E0B' : '#EF4444';

  // ── Render helpers ─────────────────────────────────────────────────────────
  const medal = (rank: number) =>
    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

  const scoreLabel = useMemo(() => {
    const correct = answered.filter(Boolean).length || (data?.myScore?.correct ?? 0);
    const total   = data?.questions.length ?? data?.myScore?.total ?? 5;
    if (correct === total)    return isAr ? '🏆 مثالي!' : '🏆 Parfait!';
    if (correct >= total - 1) return isAr ? '🌟 ممتاز!'  : '🌟 Excellent!';
    if (correct >= Math.ceil(total / 2)) return isAr ? '👍 جيد'   : '👍 Bien';
    return isAr ? '📚 حاول مجدداً غداً' : '📚 Réessaie demain';
  }, [answered, data, isAr]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <LinearGradient
        colors={Gradients.brand as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: 4 }}>
            <TouchableOpacity
              onPress={() => safeBack(navigation)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                marginRight: 12, width: 40, height: 40, borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.22)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize(18), letterSpacing: -0.3 }}>
                {isAr ? '🎲 التحدي اليومي' : '🎲 Défi du jour'}
              </Text>
              {data && (
                <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: fontSize(11), fontWeight: '600', marginTop: 2 }}>
                  {data.date}
                  {data.faculty && data.faculty !== 'all' ? ` · ${data.faculty}` : ''}
                </Text>
              )}
            </View>
            {/* Timer pill */}
            {phase === 'playing' && (
              <View style={{
                backgroundColor: timerColor, borderRadius: 999,
                paddingHorizontal: 14, paddingVertical: 7,
                flexDirection: 'row', alignItems: 'center', gap: 5,
                shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
              }}>
                <AppIcon name="timerOutline" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize(14) }}>
                  {timeLeft}s
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ── LOADING ── */}
      {phase === 'loading' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={{ color: C.textSecondary, fontSize: fontSize(14) }}>
            {isAr ? 'جاري تحميل أسئلة اليوم…' : 'Chargement des questions…'}
          </Text>
        </View>
      )}

      {/* ── ERROR ── */}
      {phase === 'error' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <Text style={{ fontSize: 48 }}>😕</Text>
          <Text style={{ color: C.textPrimary, fontWeight: '700', fontSize: fontSize(17), textAlign: 'center' }}>
            {isAr ? 'تعذّر تحميل التحدي' : 'Impossible de charger le défi'}
          </Text>
          <TouchableOpacity
            onPress={() => { setPhase('loading'); }}
            style={{ backgroundColor: '#7C3AED', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {isAr ? 'إعادة المحاولة' : 'Réessayer'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── SOON (admin set the challenge but it's not time yet) ── */}
      {phase === 'soon' && data && (() => {
        const now = new Date();
        const nowTotalMin = now.getUTCHours() * 60 + now.getUTCMinutes();
        const targetTotalMin = (data.showFromHour ?? 0) * 60 + (data.showFromMinute ?? 0);
        const minutesLeft = Math.max(0, targetTotalMin - nowTotalMin);
        const hLeft = Math.floor(minutesLeft / 60);
        const mLeft = minutesLeft % 60;
        const hh = String(data.showFromHour ?? 0).padStart(2, '0');
        const mm = String(data.showFromMinute ?? 0).padStart(2, '0');
        const timeLeftStr = hLeft > 0
          ? (isAr ? `${hLeft}س ${mLeft}د` : `${hLeft}h${mLeft > 0 ? ` ${mLeft}min` : ''}`)
          : (isAr ? `${mLeft} دقيقة` : `${mLeft} min`);
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
            <Text style={{ fontSize: 64 }}>⏰</Text>
            <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(22), textAlign: 'center' }}>
              {isAr ? 'التحدي لم يبدأ بعد' : 'Pas encore disponible'}
            </Text>
            <Text style={{ color: C.textSecondary, fontSize: fontSize(14), textAlign: 'center', lineHeight: 22 }}>
              {isAr
                ? `يبدأ تحدي اليوم الساعة ${hh}:${mm} UTC\n(بعد ${timeLeftStr} تقريباً)`
                : `Le défi du jour commence à ${hh}:${mm} UTC\n(dans ~${timeLeftStr})`}
            </Text>
            <TouchableOpacity
              onPress={() => safeBack(navigation)}
              style={{ backgroundColor: '#7C3AED', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize(15) }}>
                {isAr ? '← عودة' : '← Retour'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* ── READY ── */}
      {phase === 'ready' && data && (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}
        >
          <Text style={{ fontSize: 72 }}>🎲</Text>
          <Text style={{ color: C.textPrimary, fontWeight: '900', fontSize: fontSize(26), textAlign: 'center', marginTop: 16 }}>
            {isAr ? 'التحدي اليومي' : 'Défi du jour'}
          </Text>
          <Text style={{ color: C.textSecondary, fontSize: fontSize(14), textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
            {isAr
              ? `${data.questions.length} أسئلة · ${data.timeLimitS ?? 60} ثانية\nنفس الأسئلة لجميع الطلاب في فِرقتك`
              : `${data.questions.length} questions · ${data.timeLimitS ?? 60} secondes\nMêmes questions pour tous les étudiants de ta filière`}
          </Text>

          {/* Rules */}
          {[
            isAr ? '✅ كل إجابة صحيحة = 100 نقطة' : '✅ Bonne réponse = 100 pts',
            isAr ? '⚡ مكافأة السرعة = 40 نقطة إضافية' : '⚡ Bonus vitesse = 40 pts',
            isAr ? '🔄 يتجدد كل يوم منتصف الليل' : '🔄 Renouvellement chaque minuit',
          ].map(rule => (
            <View key={rule} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, alignSelf: 'stretch', paddingHorizontal: 8 }}>
              <Text style={{ color: C.textSecondary, fontSize: fontSize(13) }}>{rule}</Text>
            </View>
          ))}

          <TouchableOpacity
            onPress={handleStart}
            style={{
              marginTop: 32, backgroundColor: '#7C3AED',
              borderRadius: 18, paddingVertical: 16, paddingHorizontal: 48,
              shadowColor: '#7C3AED', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize(17) }}>
              {isAr ? 'ابدأ التحدي 🚀' : 'Commencer 🚀'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── PLAYING ── */}
      {phase === 'playing' && data && (
        <View style={{ flex: 1, padding: Spacing.md }}>
          {/* Progress dots */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20, justifyContent: 'center' }}>
            {data.questions.map((_, i) => {
              const state = i < answered.length
                ? (answered[i] ? 'correct' : 'wrong')
                : i === qIndex ? 'active' : 'pending';
              const bg = state === 'correct' ? Colors.primary
                : state === 'wrong' ? '#EF4444'
                : state === 'active' ? '#7C3AED'
                : C.border;
              return (
                <View key={i} style={{
                  width: state === 'active' ? 28 : 10, height: 10,
                  borderRadius: 5, backgroundColor: bg,
                }} />
              );
            })}
          </View>

          {/* Question card */}
          <View style={{
            backgroundColor: C.surface, borderRadius: BorderRadius.xl,
            padding: Spacing.lg, marginBottom: 20,
            borderWidth: 1, borderColor: C.border,
            shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
          }}>
            {data.questions[qIndex].subject && (
              <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: fontSize(11), marginBottom: 6 }}>
                {data.questions[qIndex].subject}
              </Text>
            )}
            <Text style={{
              color: C.textPrimary, fontWeight: '700',
              fontSize: fontSize(18), lineHeight: 28, textAlign: isAr ? 'right' : 'left',
            }}>
              {data.questions[qIndex].front}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: fontSize(12), marginTop: 10 }}>
              {isAr ? `السؤال ${qIndex + 1} من ${data.questions.length}` : `Question ${qIndex + 1} / ${data.questions.length}`}
            </Text>
          </View>

          {/* Options */}
          <View style={{ gap: 10 }}>
            {data.questions[qIndex].options.map((opt, oi) => {
              const isSelected  = selected === opt;
              const isCorrect   = opt === data.questions[qIndex].correctAnswer;
              const showResult  = selected !== null;
              const bg = showResult
                ? isCorrect ? '#10B981' : (isSelected ? '#EF4444' : C.surface)
                : (isSelected ? '#7C3AED' : C.surface);
              const textColor = showResult && (isCorrect || isSelected) ? '#fff' : C.textPrimary;
              const label = ['A', 'B', 'C', 'D'][oi];

              return (
                <Animated.View
                  key={oi}
                  style={[
                    { transform: [{ translateX: isSelected && !isCorrect && showResult ? shakeAnim : 0 }] },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => handleAnswer(opt)}
                    disabled={selected !== null}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: bg,
                      borderRadius: BorderRadius.lg,
                      borderWidth: 1.5,
                      borderColor: showResult
                        ? (isCorrect ? '#10B981' : (isSelected ? '#EF4444' : C.border))
                        : C.border,
                      padding: Spacing.md,
                      flexDirection: isAr ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <View style={{
                      width: 28, height: 28, borderRadius: 14,
                      backgroundColor: showResult && (isCorrect || isSelected)
                        ? 'rgba(255,255,255,0.25)' : (C.background),
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontWeight: '800', color: textColor, fontSize: fontSize(13) }}>
                        {showResult && isCorrect ? '✓' : showResult && isSelected ? '✗' : label}
                      </Text>
                    </View>
                    <Text style={{
                      flex: 1, color: textColor,
                      fontSize: fontSize(14), fontWeight: '600',
                      textAlign: isAr ? 'right' : 'left',
                    }}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── RESULT ── */}
      {phase === 'result' && data && (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}>
          {/* Score card */}
          <LinearGradient
            colors={Gradients.brand as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: BorderRadius['2xl'],
              padding: 30, alignItems: 'center', marginBottom: 24,
              shadowColor: '#7C3AED', shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12,
            }}>
            <Text style={{ fontSize: 52 }}>
              {(answered.filter(Boolean).length || data.myScore?.correct || 0) ===
               (data.questions.length || data.myScore?.total || 5) ? '🏆' : '🎯'}
            </Text>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize(42), marginTop: 8 }}>
              {finalScore}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: fontSize(14), marginTop: 4 }}>
              {isAr ? 'نقطة' : 'points'}
            </Text>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize(18), marginTop: 12 }}>
              {scoreLabel}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSize(13), marginTop: 6 }}>
              {isAr
                ? `${answered.filter(Boolean).length || data.myScore?.correct || 0} / ${data.questions.length || data.myScore?.total || 5} صحيح`
                : `${answered.filter(Boolean).length || data.myScore?.correct || 0} / ${data.questions.length || data.myScore?.total || 5} correctes`}
            </Text>
            {data.alreadySubmitted && (
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
                paddingHorizontal: 14, paddingVertical: 6, marginTop: 12,
              }}>
                <Text style={{ color: '#fff', fontSize: fontSize(12), fontWeight: '700' }}>
                  {isAr ? '✅ سبق لك المشاركة اليوم' : '✅ Déjà joué aujourd\'hui'}
                </Text>
              </View>
            )}
          </LinearGradient>

          {/* Leaderboard */}
          <Text style={{ color: C.textPrimary, fontWeight: '800', fontSize: fontSize(16), marginBottom: 12 }}>
            {isAr ? '🏅 لوحة الصدارة اليوم' : '🏅 Classement du jour'}
          </Text>

          {lbLoading ? (
            <ActivityIndicator color="#7C3AED" style={{ marginVertical: 24 }} />
          ) : leaderboard.length === 0 ? (
            <Text style={{ color: C.textSecondary, textAlign: 'center', marginVertical: 24, fontSize: fontSize(13) }}>
              {isAr ? 'لا يوجد منافسون بعد — كن أول المشاركين!' : 'Pas encore de compétiteurs — sois le premier!'}
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {leaderboard.map(entry => (
                <View
                  key={entry.rank}
                  style={{
                    backgroundColor: entry.isMe ? '#7C3AED' + '22' : C.surface,
                    borderRadius: BorderRadius.lg,
                    borderWidth: entry.isMe ? 1.5 : 1,
                    borderColor: entry.isMe ? '#7C3AED' : C.border,
                    padding: Spacing.md,
                    flexDirection: isAr ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 18, width: 28, textAlign: 'center' }}>
                    {medal(entry.rank)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: entry.isMe ? '#7C3AED' : C.textPrimary,
                      fontWeight: entry.isMe ? '800' : '600',
                      fontSize: fontSize(14),
                      textAlign: isAr ? 'right' : 'left',
                    }}>
                      {entry.name}
                      {entry.isMe ? (isAr ? ' (أنت)' : ' (toi)') : ''}
                    </Text>
                    <Text style={{ color: C.textMuted, fontSize: fontSize(11), textAlign: isAr ? 'right' : 'left' }}>
                      {entry.correct}/{entry.total}
                      {isAr ? ' صح · ' : ' correctes · '}
                      {entry.timeTaken}s
                    </Text>
                  </View>
                  <Text style={{
                    color: entry.isMe ? '#7C3AED' : C.textSecondary,
                    fontWeight: '800',
                    fontSize: fontSize(16),
                  }}>
                    {entry.score}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Back button */}
          <TouchableOpacity
            onPress={() => safeBack(navigation)}
            style={{
              marginTop: 28, borderRadius: 14,
              borderWidth: 1.5, borderColor: '#7C3AED',
              paddingVertical: 14, alignItems: 'center',
            }}
          >
            <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: fontSize(15) }}>
              {isAr ? '← العودة' : '← Retour'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}
