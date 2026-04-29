import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { FlashcardsStackParamList, Flashcard } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Spacing, BorderRadius } from '../../theme';
import * as Haptics from 'expo-haptics';
import * as StoreReview from 'expo-store-review';
import { Colors } from '../../theme';
import { apiRequest } from '../../utils/api';
import { safeBack } from '../../utils/safeBack';
import {
  cacheDeckCards, getCachedDeckCards,
  enqueuePendingReview,
  updateStudyStreak, trackSessionCompleted,
  incrementTodayStudiedCount,
  StreakUpdateResult,
  saveBestSession, getBestSession, GhostSession,
} from '../../utils/offlineStorage';
type Route = RouteProp<FlashcardsStackParamList, 'StudySession'>;

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - Spacing.lg * 2;

const mapCard = (c: any): Flashcard => ({
  id: c.id,
  deckId: c.deck_id,
  front: c.front,
  back: c.back,
  easeFactor: parseFloat(c.ease_factor),
  intervalDays: c.interval_days,
  repetitions: c.repetitions,
  nextReview: c.next_review,
  lastReviewed: c.last_reviewed,
});

// ── Static data outside component (no re-creation on render) ─────────────────
const RATINGS = [
  { quality: 0, label: 'مجدداً', emoji: '🔴', bg: '#FEE2E2', color: '#DC2626', desc: 'لم أتذكر' },
  { quality: 1, label: 'صعب',    emoji: '🟡', bg: '#FEF3C7', color: '#D97706', desc: 'تذكرت بصعوبة' },
  { quality: 2, label: 'جيد',    emoji: '🟢', bg: '#D1FAE5', color: Colors.primary, desc: 'تذكرت' },
  { quality: 3, label: 'سهل',    emoji: '⚡', bg: '#DBEAFE', color: '#2563EB', desc: 'سهل جداً' },
] as const;

// ── Memoized sub-components ───────────────────────────────────────────────────
const RatingButton = memo(({
  r, onPress, disabled,
}: { r: typeof RATINGS[number]; onPress: () => void; disabled: boolean }) => (
  <TouchableOpacity
    style={[styles.ratingBtn, { backgroundColor: r.bg }]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.75}
  >
    <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
    <Text style={[styles.ratingLabel, { color: r.color }]}>{r.label}</Text>
    <Text style={[styles.ratingDesc, { color: r.color + 'AA' }]}>{r.desc}</Text>
  </TouchableOpacity>
));

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StudySessionScreen() {
  const navigation = useNavigation();
  const { params: { deckId, deckTitle, deckColor, quizMode } } = useRoute<Route>();
  const { token } = useAuth();

  const [cards, setCards]     = useState<Flashcard[]>([]);
  const [idx, setIdx]         = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]       = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [newStreak, setNewStreak] = useState(0);
  const [streakResult, setStreakResult] = useState<StreakUpdateResult | null>(null);
  // ── Ghost mode ───────────────────────────────────────
  const [ghost, setGhost] = useState<GhostSession | null>(null);
  // Live correct count for ghost comparison
  const correctRef = useRef(0);
  // ── Replay Instantané (#62) — shown 2.8s after a wrong answer ────────────
  const [replayCard, setReplayCard]   = useState<{ back: string } | null>(null);
  const replaySlide  = useRef(new Animated.Value(160)).current;
  const replayTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animation refs (never re-created) ────────────────────────────────────
  const flipAnim   = useRef(new Animated.Value(0)).current;
  const helixAnim  = useRef(new Animated.Value(0)).current;
  // Interpolations stored in refs — computed once, never GC'd between renders
  const frontInterp = useRef(
    flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })
  ).current;
  const backInterp  = useRef(
    flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] })
  ).current;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest<any[]>(`/flashcards/decks/${deckId}/due`, { token });
        if (cancelled) return;
        let mapped = (data || []).map(mapCard);
        // Fisher-Yates shuffle
        for (let i = mapped.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
        }
        if (quizMode) mapped = mapped.slice(0, 10); // Quick Quiz: max 10 cards
        setCards(mapped);
        if (mapped.length === 0) setDone(true);
        cacheDeckCards(deckId, mapped); // persist for offline use
        setIsOffline(false);
      } catch {
        // Network error — try local cache
        const cached = await getCachedDeckCards(deckId);
        if (!cancelled) {
          if (cached && cached.cards.length > 0) {
            let cards = quizMode ? cached.cards.slice(0, 10) : cached.cards;
            setCards(cards);
            setIsOffline(true);
          } else {
            // No cache — nothing to study
            setDone(true);
            setIsOffline(true);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deckId, token, quizMode]);

  // ── DNA Helix oscillation loop ───────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(helixAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(helixAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load ghost session for this deck on mount
  useEffect(() => {
    getBestSession(deckId).then(setGhost).catch(() => {});
  }, [deckId]);

  // Cleanup replay timer on unmount
  useEffect(() => () => { if (replayTimer.current) clearTimeout(replayTimer.current); }, []);

  // ── Stable callbacks (useCallback) ───────────────────────────────────────
  const flip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlipped(prev => {
      const toValue = prev ? 0 : 1;
      Animated.spring(flipAnim, {
        toValue,
        useNativeDriver: true,
        friction: 8,
        tension: 60,
      }).start();
      return !prev;
    });
  }, [flipAnim]);

  const rate = useCallback(async (quality: number) => {
    if (submitting) return;
    const reviewedCard = cards[idx]; // capture BEFORE idx changes — used for replay
    Haptics.impactAsync(quality >= 2 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
    setSubmitting(true);
    const labels = ['again', 'hard', 'good', 'easy'] as const;
    setSessionStats(prev => ({ ...prev, [labels[quality]]: prev[labels[quality]] + 1 }));
    if (quality >= 2) correctRef.current += 1; // ghost mode tracking
    incrementTodayStudiedCount().catch(() => {});
    // ── Replay Instantané: show answer again for 2.8s on a wrong rating ─────
    if (quality === 0 && reviewedCard?.back) {
      setReplayCard({ back: reviewedCard.back });
      replaySlide.setValue(160);
      Animated.spring(replaySlide, { toValue: 0, useNativeDriver: true, friction: 10, tension: 60 }).start();
      if (replayTimer.current) clearTimeout(replayTimer.current);
      replayTimer.current = setTimeout(() => {
        Animated.timing(replaySlide, { toValue: 160, duration: 220, useNativeDriver: true })
          .start(() => setReplayCard(null));
      }, 2800);
    }
    if (!quizMode) {
      try {
        await apiRequest(`/flashcards/cards/${cards[idx].id}/review`, {
          method: 'POST', token, body: { quality },
        });
      } catch {
        // Offline — enqueue for later sync
        await enqueuePendingReview({
          cardId: cards[idx].id,
          quality,
          reviewedAt: new Date().toISOString(),
        });
        setPendingCount(prev => prev + 1);
      }
    }

    setIdx(prev => {
      const next = prev + 1;
      if (next >= cards.length) {
        // Session complete — update streak + maybe request review
        (async () => {
          const result = await updateStudyStreak();
          setNewStreak(result.count);
          setStreakResult(result);
          const sessions = await trackSessionCompleted();
          // Save ghost session (best score record)
          if (!quizMode) {
            await saveBestSession(deckId, correctRef.current, cards.length).catch(() => {});
          }
          // Request store review after 3rd and 10th session
          if ((sessions === 3 || sessions === 10) && await StoreReview.hasAction()) {
            await StoreReview.requestReview();
          }
        })();
        setDone(true);
        return prev;
      }
      flipAnim.setValue(0);
      setFlipped(false);
      return next;
    });
    setSubmitting(false);
  }, [submitting, cards, idx, token, flipAnim, quizMode]);

  // ── Stable per-rating handlers (avoids inline arrow in JSX) ──────────────
  const rateHandlers = useMemo(
    () => RATINGS.map(r => () => rate(r.quality)),
    [rate],
  );

  // ── Derived values (useMemo) ──────────────────────────────────────────────
  const current  = useMemo(() => cards[idx], [cards, idx]);
  const progress = useMemo(
    () => (cards.length > 0 ? `${(idx / cards.length) * 100}%` : '0%'),
    [cards.length, idx],
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDFE' }}>
        <ActivityIndicator size="large" color={deckColor} />
      </View>
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) {
    const total    = sessionStats.again + sessionStats.hard + sessionStats.good + sessionStats.easy;
    const recalled = sessionStats.good + sessionStats.easy;
    const pct      = total > 0 ? Math.round((recalled / total) * 100) : 0;
    return (
      <View style={{ flex: 1, backgroundColor: '#F0FDFE' }}>
        <StatusBar barStyle="light-content" backgroundColor={deckColor} />
        <View style={[styles.doneHeader, { backgroundColor: deckColor }]}>
          <SafeAreaView edges={['top']}>
            <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Flashcards' } })} style={{ padding: 12 }}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
        </View>
        <View style={styles.doneBody}>
          <Text style={{ fontSize: 72 }}>{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</Text>
          <Text style={styles.doneTitle}>{quizMode ? '★ انتهت المسابقة!' : 'انتهت الجلسة!'}</Text>
          <Text style={styles.deckNameLabel}>{deckTitle}</Text>
          {newStreak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>
                {newStreak >= 7 ? '🔥🔥' : '🔥'} سلسلة {newStreak} {newStreak === 1 ? 'يوم' : 'أيام'}
              </Text>
            </View>
          )}
          {streakResult?.usedFreeze && (
            <View style={[styles.streakBadge, { backgroundColor: '#DBEAFE', borderColor: '#93C5FD', borderWidth: 1 }]}>
              <Text style={[styles.streakBadgeText, { color: '#1D4ED8' }]}>❄️ استُخدمت بلورة التجميد — سلسلتك محمية!</Text>
            </View>
          )}
          {streakResult?.isNewTier && (
            <View style={[styles.streakBadge, { backgroundColor: '#FEF9C3', borderColor: '#FCD34D', borderWidth: 1 }]}>
              <Text style={[styles.streakBadgeText, { color: '#92400E', fontSize: 15 }]}>
                {streakResult.tier === 'bronze'  ? '🥉 مرحباً في مجتمع البرونز!' : null}
                {streakResult.tier === 'silver'  ? '🥈 مرحباً في مجتمع الفضة!'  : null}
                {streakResult.tier === 'gold'    ? '🥇 مرحباً في مجتمع الذهب!'  : null}
                {streakResult.tier === 'diamond' ? '💎 مرحباً في مجتمع الماس!'  : null}
              </Text>
            </View>
          )}
          {quizMode && (
            <View style={[styles.streakBadge, { backgroundColor: '#DBEAFE' }]}>
              <Text style={[styles.streakBadgeText, { color: '#2563EB' }]}>⚡ وضع المسابقة — لم يتم تسجيل في الخوارزمية</Text>
            </View>
          )}
          <View style={[styles.scoreCircle, { borderColor: deckColor }]}>
            <Text style={[styles.scoreNum, { color: deckColor }]}>{pct}%</Text>
            <Text style={styles.scoreLabel}>معدل التذكر</Text>
          </View>
          <View style={styles.statsRow}>
            {RATINGS.map((r, i) => {
              const count = [sessionStats.again, sessionStats.hard, sessionStats.good, sessionStats.easy][i];
              return (
                <View key={r.quality} style={[styles.statBox, { backgroundColor: r.bg }]}>
                  <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
                  <Text style={[styles.statBoxNum, { color: r.color }]}>{count}</Text>
                  <Text style={[styles.statBoxLabel, { color: r.color }]}>{r.label}</Text>
                </View>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: deckColor }]}
            onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Flashcards' } })}
          >
            <Text style={styles.doneBtnText}>العودة للمجموعات</Text>
          </TouchableOpacity>
          {pendingCount > 0 && (
            <View style={styles.pendingNote}>
              <AppIcon name="timeOutline" size={14} color="#D97706" />
              <Text style={styles.pendingNoteText}>
                {pendingCount} مراجعة ستُزامن عند الاتصال
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ── Study screen ──────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F0FDFE' }}>
      <StatusBar barStyle="light-content" backgroundColor={deckColor} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: deckColor }]}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Flashcards' } })} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle} numberOfLines={1}>{deckTitle}</Text>
              <Text style={styles.headerProgress}>{idx + 1} / {cards.length}</Text>
            </View>
            <View style={{ width: 38, alignItems: 'center' }}>
              {isOffline && (
                <AppIcon name="cloudOfflineOutline" size={18} color="rgba(255,255,255,0.7)" />
              )}
              {pendingCount > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
          </View>
          {/* DNA Helix progress bar */}
          <View style={styles.dnaTrack}>
            {Array.from({ length: 20 }).map((_, i) => {
              const filled = i / 20 < (idx / Math.max(cards.length, 1));
              const wave1 = helixAnim.interpolate({ inputRange: [0, 1], outputRange: [-(i % 2 === 0 ? 3 : -3), (i % 2 === 0 ? 3 : -3)] });
              return (
                <Animated.View
                  key={i}
                  style={[
                    styles.dnaDot,
                    filled ? styles.dnaDotFilled : styles.dnaDotEmpty,
                    { transform: [{ translateY: wave1 }] },
                  ]}
                />
              );
            })}
          </View>
          {/* Ghost mode bar — shows previous best vs current progress */}
          {ghost && cards.length > 0 && (
            <View style={styles.ghostRow}>
              <Text style={styles.ghostText}>
                {`👻 أفضل: ${ghost.pct}%  ·  الآن: ${
                  Math.round(((sessionStats.good + sessionStats.easy) / cards.length) * 100)
                }%${
                  sessionStats.good + sessionStats.easy >= Math.round((ghost.pct / 100) * cards.length)
                    ? '  🔥'
                    : ''
                }`}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </View>

      {/* Card — tap anywhere to flip */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={flip}
        style={styles.cardArea}
      >
        {/* Front */}
        <Animated.View
          style={[styles.card, {
            transform: [{ rotateY: frontInterp }],
            zIndex: flipped ? 0 : 1,
            backfaceVisibility: 'hidden',
          }]}
        >
          <View style={[styles.faceTag, { backgroundColor: deckColor + '22' }]}>
            <Text style={[styles.faceTagText, { color: deckColor }]}>السؤال</Text>
          </View>
          <Text style={styles.cardText}>{current?.front}</Text>
          <Text style={[styles.tapHint, { color: deckColor + '99' }]}>اضغط لرؤية الإجابة</Text>
        </Animated.View>

        {/* Back */}
        <Animated.View
          style={[styles.card, styles.cardBack, {
            transform: [{ rotateY: backInterp }],
            zIndex: flipped ? 1 : 0,
            backfaceVisibility: 'hidden',
          }]}
        >
          <View style={[styles.faceTag, { backgroundColor: '#D1FAE5' }]}>
            <Text style={[styles.faceTagText, { color: Colors.primary }]}>الإجابة</Text>
          </View>
          <Text style={styles.cardText}>{current?.back}</Text>
          <Text style={[styles.tapHint, { color: Colors.primary + '99' }]}>اضغط للعودة للسؤال</Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Rating buttons — shown only when flipped */}
      {flipped && (
        <View style={styles.ratingArea}>
          <Text style={styles.ratingPrompt}>كيف كان تذكرك؟</Text>
          <View style={styles.ratingRow}>
            {RATINGS.map((r, i) => (
              <RatingButton
                key={r.quality}
                r={r}
                onPress={rateHandlers[i]}
                disabled={submitting}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Replay Instantané overlay — slides up after a wrong answer ── */}
      {replayCard && (
        <Animated.View
          style={[styles.replayBubble, { transform: [{ translateY: replaySlide }] }]}
          pointerEvents="none"
        >
          <View style={styles.replayBubbleHeader}>
            <Text style={styles.replayBubbleHeaderText}>💡 الإجابة الصحيحة</Text>
            <View style={styles.replayDot} />
          </View>
          <Text style={styles.replayBubbleText} numberOfLines={4}>{replayCard.back}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: 8,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  headerProgress: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  dnaTrack: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.lg, marginTop: 8, marginBottom: 2, gap: 3,
  },
  dnaDot: {
    width: 7, height: 7, borderRadius: 4, flex: 1,
  },
  dnaDotFilled: { backgroundColor: 'rgba(255,255,255,0.9)' },
  dnaDotEmpty: { backgroundColor: 'rgba(255,255,255,0.22)' },
  // kept for any leftover references
  progressTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: Spacing.lg, borderRadius: 2, marginTop: 8 },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.8)' },
  ghostRow: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 3,
    marginTop: 6,
    marginBottom: 2,
  },
  ghostText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  cardArea: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: 16,
    perspective: 1000,
  } as any,

  card: {
    position: 'absolute',
    width: CARD_W,
    minHeight: 240,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  cardBack: { backgroundColor: '#F0FFF4' },
  faceTag: {
    position: 'absolute', top: 16, right: 16,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  faceTagText: { fontSize: 11, fontWeight: '700' },
  cardText: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', lineHeight: 34 },
  tapHint: { fontSize: 12, fontWeight: '500', marginTop: 20, fontStyle: 'italic' },

  ratingArea: { paddingHorizontal: Spacing.lg, paddingBottom: 140, paddingTop: 16 },
  ratingPrompt: { fontSize: 14, fontWeight: '600', color: '#374151', textAlign: 'center', marginBottom: 12 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: BorderRadius.lg, gap: 4 },
  ratingLabel: { fontSize: 13, fontWeight: '800' },
  ratingDesc: { fontSize: 10, fontWeight: '500' },

  streakBadge: {
    backgroundColor: '#FEF3C7', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, marginTop: 8,
  },
  streakBadgeText: { fontSize: 14, fontWeight: '700', color: '#D97706' },

  // Done screen
  doneHeader: { paddingBottom: 8 },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  doneTitle: { fontSize: 28, fontWeight: '800', color: '#111827' },
  deckNameLabel: { fontSize: 14, color: '#6B7280' },
  scoreCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 4, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  scoreNum: { fontSize: 36, fontWeight: '800' },
  scoreLabel: { fontSize: 12, color: '#6B7280' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  statBox: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.lg, paddingVertical: 12, gap: 4 },
  statBoxNum: { fontSize: 22, fontWeight: '800' },
  statBoxLabel: { fontSize: 11, fontWeight: '600' },
  doneBtn: { marginTop: 16, paddingHorizontal: 32, paddingVertical: 14, borderRadius: BorderRadius.lg },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  pendingBadge: {
    backgroundColor: '#D97706', borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 2, minWidth: 18, alignItems: 'center',
  },
  pendingBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  pendingNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF3C7', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 4,
  },
  pendingNoteText: { color: '#92400E', fontSize: 12, fontWeight: '600' },

  // ── Replay Instantané ──────────────────────────────────────────────────────
  replayBubble: {
    position: 'absolute',
    bottom: 170,
    left: 20,
    right: 20,
    backgroundColor: '#1E1B4B',
    borderRadius: 18,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  replayBubbleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  replayBubbleHeaderText: { fontSize: 12, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.5 },
  replayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  replayBubbleText: { fontSize: 15, fontWeight: '600', color: '#E0E7FF', lineHeight: 22 },
});
