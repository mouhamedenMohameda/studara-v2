/**
 * WrappedScreen — Bilan de fin de semestre style "Spotify Wrapped"  🎁
 * 5 slides animées façon Instagram Stories avec progression automatique.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, Animated, Share, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useAuth }     from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  getSessionsCompleted,
  getStudyStreak,
  getLast7DaysActivity,
  getStreakTier,
  STREAK_TIERS,
} from '../../utils/offlineStorage';
import { safeBack } from '../../utils/safeBack';

// ─── Constants ────────────────────────────────────────────────────────────────

const SLIDE_DURATION = 5000;
const NUM_SLIDES = 5;

const BG_COLORS: [string, string][] = [
  ['#5B21B6', '#1E1040'],   // 0 — intro (violet)
  ['#065F46', '#022C1E'],   // 1 — sessions (emerald)
  ['#B45309', '#451A03'],   // 2 — streak (amber)
  ['#1E3A8A', '#0F1729'],   // 3 — heatmap (indigo)
  ['#BE185D', '#2A0414'],   // 4 — share (pink)
];

const ACCENT_COLORS = ['#C4B5FD', '#6EE7B7', '#FCD34D', '#93C5FD', '#F9A8D4'];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WrappedScreen() {
  const navigation = useNavigation();
  const { user }   = useAuth();
  const { lang, t }   = useLanguage();
  const isAr       = lang === 'ar';

  // ── Data ──────────────────────────────────────────────────────────────────
  const [slide,      setSlide]      = useState(0);
  const [loaded,     setLoaded]     = useState(false);
  const [sessions,   setSessions]   = useState(0);
  const [streak,     setStreak]     = useState(0);
  const [activity,   setActivity]   = useState<boolean[]>(Array(7).fill(false));
  const [displayNum, setDisplayNum] = useState(0);

  // ── Animations ────────────────────────────────────────────────────────────
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim     = useRef(new Animated.Value(1)).current;
  const scaleAnim    = useRef(new Animated.Value(0.92)).current;

  const progressAnim2 = useRef<Animated.CompositeAnimation | null>(null);
  const countTimer    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      getSessionsCompleted().catch(() => 0),
      getStudyStreak().catch(() => 0),
      getLast7DaysActivity().catch(() => Array(7).fill(false)),
    ]).then(([s, st, act]) => {
      setSessions(s as number);
      setStreak(st as number);
      setActivity(act as boolean[]);
      setLoaded(true);
    });
  }, []);

  // ── Navigation between slides ─────────────────────────────────────────────
  const goTo = useCallback((idx: number) => {
    if (idx < 0) { safeBack(navigation as any, { name: 'Profile' }); return; }
    if (idx >= NUM_SLIDES) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Entrance animation
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.94);
    setDisplayNum(0);
    setSlide(idx);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1,    duration: 320, useNativeDriver: true }),
      Animated.spring( scaleAnim, { toValue: 1, friction: 8, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, scaleAnim, navigation]);

  // ── Auto-advance progress bar ─────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    if (slide >= NUM_SLIDES - 1) return; // last slide has no auto-advance
    progressAnim.setValue(0);
    progressAnim2.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: SLIDE_DURATION,
      useNativeDriver: false,
    });
    progressAnim2.current.start(({ finished }) => {
      if (finished) goTo(slide + 1);
    });
    return () => progressAnim2.current?.stop();
  }, [slide, loaded]);

  // ── Animated number counter ───────────────────────────────────────────────
  useEffect(() => {
    if (countTimer.current) clearInterval(countTimer.current);
    const target = slide === 1 ? sessions : slide === 2 ? streak : 0;
    if (target <= 0) { setDisplayNum(0); return; }
    let cur = 0;
    const steps   = 28;
    const stepSz  = Math.max(1, Math.ceil(target / steps));
    const delay   = Math.round(1600 / steps);
    countTimer.current = setInterval(() => {
      cur = Math.min(cur + stepSz, target);
      setDisplayNum(cur);
      if (cur >= target) clearInterval(countTimer.current!);
    }, delay);
    return () => { if (countTimer.current) clearInterval(countTimer.current); };
  }, [slide, loaded, sessions, streak]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const tierKey  = getStreakTier(streak);
  const tierInfo = STREAK_TIERS.find(t => t.tier === tierKey);
  const accent   = ACCENT_COLORS[slide] ?? '#A78BFA';
  const activeDays = activity.filter(Boolean).length;

  const handleShare = () => {
    const tierLabel = tierInfo?.labelAr ?? '';
    const tierEmoji = tierInfo?.emoji   ?? '🌱';
    const msg = isAr
      ? `📚 ملخّصي الدراسي في Studara\n🃏 ${sessions} جلسة مراجعة\n🔥 ${streak} يوم متواصل\n${tierEmoji} ${tierLabel}\nstudara.app`
      : `📚 Mon bilan Studara\n🃏 ${sessions} sessions de révision\n🔥 ${streak} jours de suite\n${tierEmoji} Niveau ${tierLabel || 'en cours'}\nstudara.app`;
    Share.share({ message: msg });
  };

  // ── Loading splash ────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F0B2E', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 44 }}>✨</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12, fontSize: 14 }}>
          {t('wrapped.loading')}
        </Text>
      </View>
    );
  }

  // ── Slides ────────────────────────────────────────────────────────────────
  const slides: React.ReactNode[] = [

    /* 0 — Intro */
    <View style={ss.slideContent} key="0">
      <Text style={{ fontSize: 80 }}>📚</Text>
      <Text style={[ss.bigTitle, { color: accent }]}>
        {t('wrapped.title')}
      </Text>
      <Text style={ss.subTitle}>
        {isAr
          ? `مرحباً، ${user?.fullName?.split(' ')[0] ?? 'طالب'}! 👋`
          : `Salut, ${user?.fullName?.split(' ')[0] ?? 'étudiant'} ! 👋`}
      </Text>
      <Text style={ss.hint}>
        {t('wrapped.swipe')}
      </Text>
    </View>,

    /* 1 — Sessions */
    <View style={ss.slideContent} key="1">
      <Text style={[ss.countNum, { color: accent }]}>{displayNum}</Text>
      <Text style={ss.countLabel}>
        {t('wrapped.sessions_label')}
      </Text>
      <Text style={ss.subTitle}>{t('wrapped.since_start')}</Text>
      {sessions >= 10 && (
        <View style={[ss.badge, { borderColor: accent }]}>
          <Text style={[ss.badgeText, { color: accent }]}>{t('wrapped.champion')}</Text>
        </View>
      )}
      {sessions === 0 && (
        <View style={[ss.badge, { borderColor: accent }]}>
          <Text style={[ss.badgeText, { color: accent }]}>{t('wrapped.start_cta')}</Text>
        </View>
      )}
    </View>,

    /* 2 — Streak */
    <View style={ss.slideContent} key="2">
      <Text style={{ fontSize: 72 }}>{tierInfo?.emoji ?? '🔥'}</Text>
      <Text style={[ss.countNum, { color: accent }]}>{displayNum}</Text>
      <Text style={ss.countLabel}>
        {t('wrapped.streak_label')}
      </Text>
      <View style={[ss.badge, { borderColor: accent }]}>
        <Text style={[ss.badgeText, { color: accent }]}>
          {tierInfo
            ? `${tierInfo.emoji} ${isAr ? `مستوى ${tierInfo.labelAr}` : `Niveau ${tierInfo.tier}`}`
            : t('wrapped.start_cta')}
        </Text>
      </View>
    </View>,

    /* 3 — 7-day heatmap */
    <View style={ss.slideContent} key="3">
      <Text style={[ss.bigTitle, { color: accent }]}>
        {t('wrapped.activity')}
      </Text>
      <View style={ss.heatRow}>
        {activity.map((on, i) => (
          <View
            key={i}
            style={[ss.heatDot, { backgroundColor: on ? accent : 'rgba(255,255,255,0.12)' }]}
          >
            {on && <AppIcon name='checkmark' size={15} color="#fff" />}
          </View>
        ))}
      </View>
      <Text style={ss.subTitle}>
        {`${activeDays} ${t('wrapped.active_days')}`}
      </Text>
      {activeDays >= 5 && (
        <View style={[ss.badge, { borderColor: accent }]}>
          <Text style={[ss.badgeText, { color: accent }]}>
            {t('wrapped.super_week')}
          </Text>
        </View>
      )}
      {activeDays === 0 && (
        <Text style={[ss.hint, { marginTop: 8 }]}>
          {t('wrapped.one_card_hint')}
        </Text>
      )}
    </View>,

    /* 4 — Share */
    <View style={ss.slideContent} key="4">
      <Text style={{ fontSize: 72 }}>🌍</Text>
      <Text style={[ss.bigTitle, { color: accent }]}>
        {t('wrapped.share_title')}
      </Text>
      <Text style={ss.subTitle}>
        {t('wrapped.share_sub')}
      </Text>
      <TouchableOpacity
        style={[ss.shareBtn, { backgroundColor: accent }]}
        onPress={handleShare}
        activeOpacity={0.85}
      >
        <AppIcon name="shareSocial" size={20} color="#fff" />
        <Text style={ss.shareBtnText}>{t('wrapped.share_btn')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={ss.doneBtn} onPress={() => safeBack(navigation as any, { name: 'Profile' })}>
        <Text style={ss.doneBtnText}>{t('wrapped.close')}</Text>
      </TouchableOpacity>
    </View>,
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor={BG_COLORS[slide][0]} />
      <LinearGradient colors={BG_COLORS[slide]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>

          {/* ── Progress segments ──────────────────────────────────────────── */}
          <View style={ss.progressRow}>
            {Array.from({ length: NUM_SLIDES }).map((_, i) => (
              <View key={i} style={ss.progressTrack}>
                <Animated.View
                  style={[ss.progressFill, {
                    width: i < slide
                      ? '100%'
                      : i === slide
                        ? (progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) as any)
                        : '0%',
                  }]}
                />
              </View>
            ))}
          </View>

          {/* ── Close button ───────────────────────────────────────────────── */}
          <TouchableOpacity style={ss.closeBtn} onPress={() => safeBack(navigation as any, { name: 'Profile' })}>
            <AppIcon name='close' size={22} color="rgba(255,255,255,0.65)" />
          </TouchableOpacity>

          {/* ── Slide content with fade + scale animation ─────────────────── */}
          <Animated.View
            style={{ flex: 1, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}
          >
            {slides[slide]}
          </Animated.View>

          {/* ── Tap zones (only for slides that auto-advance) ─────────────── */}
          {slide < NUM_SLIDES - 1 && (
            <View style={ss.tapZones} pointerEvents="box-none">
              <TouchableOpacity style={{ flex: 1 }} onPress={() => goTo(slide - 1)} />
              <TouchableOpacity style={{ flex: 1 }} onPress={() => goTo(slide + 1)} />
            </View>
          )}

        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  progressRow: {
    flexDirection: 'row', gap: 5,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
  },
  progressTrack: {
    flex: 1, height: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },

  closeBtn: {
    position: 'absolute', top: 50, right: 16,
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 20,
  },

  tapZones: {
    position: 'absolute', top: 80, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
  },

  slideContent: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 16,
  },
  bigTitle: {
    fontSize: 30, fontWeight: '900', textAlign: 'center', lineHeight: 38,
  },
  subTitle: {
    fontSize: 16, color: 'rgba(255,255,255,0.70)',
    textAlign: 'center', lineHeight: 24,
  },
  hint: {
    fontSize: 13, color: 'rgba(255,255,255,0.35)',
    textAlign: 'center', marginTop: 20,
  },
  countNum: {
    fontSize: 96, fontWeight: '900', lineHeight: 104,
  },
  countLabel: {
    fontSize: 22, fontWeight: '700',
    color: 'rgba(255,255,255,0.80)', textAlign: 'center',
  },
  badge: {
    borderWidth: 1.5, borderRadius: 24,
    paddingHorizontal: 20, paddingVertical: 9,
    marginTop: 6,
  },
  badgeText: { fontSize: 15, fontWeight: '800' },

  heatRow: { flexDirection: 'row', gap: 9, marginVertical: 20 },
  heatDot: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 30, paddingVertical: 17,
    borderRadius: 18, marginTop: 20,
  },
  shareBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  doneBtn:     { marginTop: 14, paddingVertical: 12, paddingHorizontal: 24 },
  doneBtnText: { fontSize: 14, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },
});
