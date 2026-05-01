import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { HomeSummary } from '../../types';
import { Colors, Spacing, BorderRadius, Shadows } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { scheduleDailyFlashcardDigest } from '../../utils/notifications';
import { getStudyStreak, getTodayStudiedCount, getDailyStudyGoal, getLast7DaysActivity, getRecentlyViewedResources, getTodayFocusMinutes, getLastNDaysActivity, ViewedResource, getStreakFreezeCount, getStreakTier, getNextTierTarget, STREAK_TIERS, StreakTier } from '../../utils/offlineStorage';
import { FeatureCard } from '@/components/cards/FeatureCard';
import { GlassKpiCard } from '@/components/cards/GlassKpiCard';
import { GlassChip } from '@/components/cards/GlassChip';

import { apiRequest } from '../../utils/api';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';

const REMINDER_COLORS: Record<string, string> = {
  exam:       '#DC2626',
  assignment: Colors.primary,
  course:     '#2563EB',
  other:      '#6B7280',
};

const REMINDER_ICONS: Record<string, AppIconName> = {
  exam:       'schoolOutline',
  assignment: 'documentTextOutline',
  course:     'bookOutline',
  other:      'ellipsisHorizontalCircleOutline',
};

// Resource type maps for recently-viewed cards
const RES_COLORS: Record<string, string> = {
  note: Colors.modules.profile, past_exam: '#EF4444', summary: '#10B981',
  exercise: '#F59E0B', project: '#3B82F6', presentation: '#EC4899', video_course: '#6366F1',
};
const RES_ICONS: Record<string, AppIconName> = {
  note: 'documentText', past_exam: 'clipboard', summary: 'reader',
  exercise: 'pencil', project: 'rocket', presentation: 'easel', video_course: 'playCircle',
};

const greetingByHour = (lang: string): string => {
  const h = new Date().getHours();
  if (lang !== 'ar') {
    if (h < 5)  return 'Bonne nuit 🌙';
    if (h < 12) return 'Bonjour ☀️';
    if (h < 17) return 'Bon après-midi 🌤';
    if (h < 21) return 'Bonsoir 🏙';
    return 'Bonne nuit 🌙';
  }
  if (h < 5)  return 'ليلة سعيدة 🌙';
  if (h < 12) return 'صباح الخير ☀️';
  if (h < 17) return 'مساء النور 🌤';
  if (h < 21) return 'مساء الخير 🌆';
  return 'ليلة سعيدة 🌙';
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export default function HomeScreen() {
  const { user, token } = useAuth();
  const { t, lang } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const [homeTab, setHomeTab] = useState<'study' | 'ai' | 'campus'>('study');
  const [localStreak, setLocalStreak] = useState(0);
  const [freezeCount,  setFreezeCount]  = useState(0);
  const [streakTier,   setStreakTier]   = useState<StreakTier>('none');
  const [todayStudied,   setTodayStudied]   = useState(0);
  const [dailyGoal,      setDailyGoal]      = useState(20);
  const [activityDots,   setActivityDots]   = useState<boolean[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<ViewedResource[]>([]);
  const [todayFocus,     setTodayFocus]     = useState(0);
  const [heatmapData,    setHeatmapData]    = useState<{date:string;cards:number;focus:number}[]>([]);

  // Styles dépendant du thème (récréés uniquement quand les couleurs changent)
  const styles = useMemo(() => makeStyles(C), [C]);

  const { data: summary, refetch } = useQuery({
    queryKey: queryKeys.home(),
    queryFn: () => apiRequest<HomeSummary>('/home/summary', { token: token! }),
    enabled: !!token,
    // Instant UI: never block Home with a full-screen spinner.
    // Keep previous data while refetching to avoid flashes.
    placeholderData: (prev) => prev,
  });

  // Feature flags (instant UI updates): keep in React Query cache + refetch on focus.
  const { data: paygRows, refetch: refetchPayg } = useQuery({
    queryKey: queryKeys.billingFeatures(),
    queryFn: () => apiRequest<any[]>('/billing/features', { token: token! }),
    enabled: !!token,
    staleTime: 0,
    placeholderData: (prev) => prev,
    // Admin panel toggles should reflect quickly on-device.
    refetchInterval: 10_000,
  });

  const { data: appRows, refetch: refetchApp } = useQuery({
    queryKey: queryKeys.billingAppFeatures(),
    queryFn: () => apiRequest<any[]>('/billing/app-features', { token: token! }),
    enabled: !!token,
    staleTime: 0,
    placeholderData: (prev) => prev,
    // Admin panel toggles should reflect quickly on-device.
    refetchInterval: 10_000,
  });

  // NOTE: We intentionally avoid tying any auto-refetch to UI "refresh spinners".
  // Manual pull-to-refresh below controls the RefreshControl indicator.

  const [pullRefreshing, setPullRefreshing] = useState(false);
  const onPullRefresh = useCallback(async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    try {
      // Run refreshes in parallel (fast) without blocking the UI.
      const tasks: Promise<any>[] = [refetch()];
      if (token) tasks.push(refetchPayg(), refetchApp());
      await Promise.allSettled(tasks);
    } finally {
      setPullRefreshing(false);
    }
  }, [pullRefreshing, refetch, refetchPayg, refetchApp, token]);

  const paygActiveByKey = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const r of Array.isArray(paygRows) ? paygRows : []) {
      map[String((r as any).key)] = !!(r as any).is_active;
    }
    return map;
  }, [paygRows]);

  const appActiveByKey = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const r of Array.isArray(appRows) ? appRows : []) {
      map[String((r as any).key)] = !!(r as any).is_active;
    }
    return map;
  }, [appRows]);

  // Load local streak from AsyncStorage on every focus
  useFocusEffect(useCallback(() => {
    getStudyStreak().then(s => {
      setLocalStreak(s);
      setStreakTier(getStreakTier(s));
    }).catch(() => {});
    getStreakFreezeCount().then(setFreezeCount).catch(() => {});
    getTodayStudiedCount().then(setTodayStudied).catch(() => {});
    getDailyStudyGoal().then(setDailyGoal).catch(() => {});
    getLast7DaysActivity().then(setActivityDots).catch(() => {});
    getRecentlyViewedResources().then(setRecentlyViewed).catch(() => {});
    getTodayFocusMinutes().then(setTodayFocus).catch(() => {});
    getLastNDaysActivity(28).then(setHeatmapData).catch(() => {});
    // Avoid aggressive refetch-on-focus which can cause perceived "reload" loops
    // and (previously) full-screen loading. Users can still pull-to-refresh.
    // Keep a light refetch only when we have a token and no summary yet.
    // Refresh feature flags immediately (no UI blocking).
    if (token) {
      refetchPayg();
      refetchApp();
    }
    if (token && !summary) refetch();
  }, [refetch, token, summary, refetchPayg, refetchApp]));

  useEffect(() => {
    if (summary?.dueCards && summary.dueCards > 0) {
      scheduleDailyFlashcardDigest(summary.dueCards).catch(() => {});
    }
  }, [summary?.dueCards]);

  const REMINDER_LABELS = useMemo<Record<string, string>>(() => ({
    exam:       t('rem.type.exam'),
    assignment: t('rem.type.assignment'),
    course:     t('rem.type.course'),
    other:      t('rem.type.other'),
  }), [t]);

  const firstName = useMemo(
    () => user?.fullName?.split(' ')[0] ?? (lang === 'fr' ? 'Étudiant' : 'طالب'),
    [user?.fullName, lang],
  );

  const goToExplore = useCallback((screen: 'Resources' | 'Timetable' | 'Courses' | 'Flashcards' | 'Jobs' | 'Opportunities' | 'Reminders' | 'Housing') => {
    // Open as a root-stack push (animated), not by switching tabs (brusque).
    const root = (navigation as any)?.getParent?.()?.getParent?.();
    if (root?.navigate) {
      root.navigate('ExploreModal', { screen });
      return;
    }
    navigation.navigate('Explore', { screen });
  }, [navigation]);

  const goToTab = useCallback((tabName: string) => {
    // Switch bottom tabs (or fallback to regular navigate).
    (navigation as any)?.navigate?.(tabName);
  }, [navigation]);

  const greeting = useMemo(() => greetingByHour(lang), [lang]);
  const isRTL = lang === 'ar';

  const heroLead = useMemo(
    () => (lang === 'ar' ? 'جاهز نكمل؟' : 'On reprend où tu en étais ?'),
    [lang],
  );

  const heroMainLine = useMemo(() => {
    const due = summary?.dueCards ?? 0;
    if (lang === 'ar') {
      return due > 0
        ? `${due} بطاقة تنتظر المراجعة`
        : 'خطط جلسة قصيرة اليوم ⚡';
    }
    return due > 0
      ? `${due} fiches à revoir`
      : 'Une session courte, ça suffit ⚡';
  }, [lang, summary?.dueCards]);

  const heroCtaLabel = useMemo(() => {
    const due = summary?.dueCards ?? 0;
    if (lang === 'ar') {
      return due > 0 ? 'مراجعة البطاقات' : 'تصفّح الموارد';
    }
    return due > 0 ? 'Voir mes fiches' : 'Voir les ressources';
  }, [lang, summary?.dueCards]);

  const STUDY_TILES = useMemo(() => [
    {
      key: 'resources', icon: 'library' as const, color: Colors.modules.resources,
      label: t('home.nav.resources'),
      badge: summary?.totalResources ? `${summary.totalResources}` : undefined,
      disabled: !(appActiveByKey.resources ?? true),
      onPress: () => goToExplore('Resources'),
    },
    {
      key: 'timetable', icon: 'calendar' as const, color: Colors.modules.timetable,
      label: t('home.nav.timetable'),
      disabled: !(appActiveByKey.timetable ?? true),
      onPress: () => goToExplore('Timetable'),
    },
    {
      key: 'flashcards', icon: 'albums' as const, color: Colors.modules.flashcards,
      label: t('home.nav.flashcards'),
      badge: summary?.dueCards ? `${summary.dueCards}` : undefined,
      disabled: !(appActiveByKey.flashcards ?? true),
      onPress: () => goToExplore('Flashcards'),
    },
    {
      key: 'reminders', icon: 'alarm' as const, color: Colors.modules.reminders,
      label: t('home.nav.reminders'),
      badge: summary?.todayReminders?.length ? `${summary.todayReminders.length}` : undefined,
      disabled: !(appActiveByKey.reminders ?? true),
      onPress: () => goToExplore('Reminders'),
    },
    {
      key: 'focus', icon: 'timerOutline' as const, color: '#EF4444',
      label: lang === 'ar' ? '🍅 تركيز' : '🍅 Focus',
      badge: todayFocus > 0 ? `${todayFocus}${lang === 'ar' ? 'د' : 'm'}` : undefined,
      disabled: !(appActiveByKey.focus ?? true),
      onPress: () => navigation.navigate('Pomodoro' as any),
    },
    {
      key: 'daily', icon: 'gameControllerOutline' as const, color: Colors.primary,
      label: lang === 'ar' ? '🎲 تحدي اليوم' : '🎲 Défi du jour',
      disabled: !(appActiveByKey.daily ?? true),
      onPress: () => navigation.navigate('DailyChallenge' as any),
    },
    {
      key: 'profile', icon: 'personOutline' as const, color: Colors.textSecondary,
      label: t('home.nav.profile'),
      disabled: !(appActiveByKey.profile ?? true),
      onPress: () => navigation.navigate('Profile'),
    },
  ], [t, summary?.totalResources, summary?.dueCards, summary?.todayReminders?.length, goToExplore, lang, todayFocus, navigation, appActiveByKey]);

  const AI_TILES = useMemo(() => [
    {
      key: 'askzad',
      icon: 'chatbubbleEllipsesOutline' as const,
      color: Colors.primary,
      label: lang === 'ar' ? 'مساعدك الذكي' : 'Assistant IA',
      description: lang === 'ar' ? 'مساعدك الذكي' : 'Ton assistant IA',
      emoji: '🤖',
      disabled: !(appActiveByKey.askzad ?? false),
      badge: !(appActiveByKey.askzad ?? false) ? t('common.soon') : undefined,
      onPress: () => navigation.navigate('AskZad' as any),
    },
    {
      key: 'whisper',
      icon: 'micOutline' as const,
      color: Colors.primaryDark,
      label: lang === 'ar' ? 'ويسبر' : 'Whisper',
      description: lang === 'ar' ? 'تحويل الصوت لنص' : 'Transcription vocale',
      emoji: '🎙️',
      disabled: !(appActiveByKey.whisper ?? true),
      onPress: () => navigation.navigate('VoiceNotes' as any),
    },
    {
      key: 'ai_summary',
      icon: 'sparkles' as const,
      color: Colors.secondaryDark,
      label: lang === 'ar' ? '✨ ملخص ذكي' : '✨ Résumé intelligent',
      description: lang === 'ar' ? 'PDF/صورة → ملخص + PDF' : 'PDF/image → résumé + PDF',
      emoji: '📄',
      disabled: !(appActiveByKey.ai_summary ?? false) || !(paygActiveByKey.ai_summary ?? false),
      badge: (!(appActiveByKey.ai_summary ?? false) || !(paygActiveByKey.ai_summary ?? false)) ? t('common.soon') : undefined,
      onPress: () => {
        const root = (navigation as any)?.getParent?.()?.getParent?.();
        if (root?.navigate) root.navigate('AISummaryImport');
        else navigation.navigate('AISummaryImport' as any);
      },
    },
    {
      key: 'ai_exercise_correction',
      icon: 'schoolOutline' as const,
      color: Colors.modules.news,
      label: lang === 'ar' ? '✅ تصحيح تمارين' : '✅ Correction IA',
      description: lang === 'ar' ? 'صورة/نص → حل مفصل + PDF' : 'Photo/texte → correction + PDF',
      emoji: '✅',
      disabled: !(appActiveByKey.ai_exercise_correction ?? false) || !(paygActiveByKey.ai_exercise_correction ?? false),
      badge: (!(appActiveByKey.ai_exercise_correction ?? false) || !(paygActiveByKey.ai_exercise_correction ?? false)) ? t('common.soon') : undefined,
      onPress: () => {
        const root = (navigation as any)?.getParent?.()?.getParent?.();
        if (root?.navigate) root.navigate('AIExerciseImport');
        else navigation.navigate('AIExerciseImport' as any);
      },
    },
  ], [lang, navigation, t, paygActiveByKey.ai_summary, paygActiveByKey.ai_exercise_correction, appActiveByKey]);

  const COMMUNITY_TILES = useMemo(() => [
    {
      key: 'jobs', icon: 'briefcaseOutline' as const, color: Colors.modules.jobs,
      label: t('tab.jobs'),
      disabled: !(appActiveByKey.jobs ?? true),
      onPress: () => goToExplore('Jobs'),
    },
    {
      key: 'opportunities', icon: 'schoolOutline' as const, color: Colors.primary,
      label: t('opp.nav'),
      disabled: !(appActiveByKey.opportunities ?? true),
      onPress: () => goToExplore('Opportunities'),
    },
    {
      key: 'housing', icon: 'homeOutline' as const, color: '#F59E0B',
      label: lang === 'ar' ? '🏠 سكن' : '🏠 Logement',
      disabled: !(appActiveByKey.housing ?? true),
      onPress: () => goToExplore('Housing'),
    },
    {
      key: 'courses', icon: 'playCircleOutline' as const, color: '#3B82F6',
      label: lang === 'ar' ? '🎬 دروس فيديو' : '🎬 Cours vidéo',
      disabled: !(appActiveByKey.courses ?? true),
      onPress: () => goToExplore('Courses'),
    },
    {
      key: 'forum', icon: 'chatbubblesOutline' as const, color: '#F59E0B',
      label: lang === 'ar' ? '💬 المنتدى' : '💬 Forum Q&A',
      disabled: !(appActiveByKey.forum ?? true),
      onPress: () => navigation.navigate('Forum' as any),
    },
  ], [t, goToExplore, lang, navigation, appActiveByKey]);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 148 }}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={onPullRefresh}
            tintColor={C.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Soft UI chrome: app bar + search pill + hero banner ─────────── */}
        <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
          {/* App bar maquette (salut • avatar • notif) */}
          <View style={[styles.appBarRow, isRTL && styles.rowReverse]}>
            <View style={styles.appBarTextCol}>
              <Text style={[styles.appBarHello, isRTL && styles.rtlText]} numberOfLines={1}>
                {greeting}
              </Text>
              <Text style={[styles.appBarName, isRTL && styles.rtlText]} numberOfLines={1}>
                {firstName}
              </Text>
            </View>
            <View style={styles.appBarTrailing}>
              <TouchableOpacity
                onPress={() => goToExplore('Reminders')}
                style={styles.appBarIconBtn}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={lang === 'ar' ? 'التذكيرات' : 'Rappels'}
              >
                <AppIcon name="notificationsOutline" size={22} color={C.textPrimary} />
                {(summary?.todayReminders?.length ?? 0) > 0 ? <View style={styles.appBarNotifDot} /> : null}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => goToTab('Profile')}
                style={styles.appBarAvatarBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.appBarAvatarTxt}>{firstName.charAt(0)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Barre recherche pilule (maquettes e‑commerce) */}
          <TouchableOpacity
            style={[styles.searchPill, isRTL && styles.rowReverse]}
            onPress={() => goToExplore('Resources')}
            activeOpacity={0.78}
          >
            <AppIcon name="searchOutline" size={20} color={C.textMuted} />
            <Text style={[styles.searchPillPlaceholder, isRTL && styles.rtlText]} numberOfLines={1}>
              {lang === 'ar' ? 'ابحث عن مذكرة، مادة، سنة…' : 'Rechercher ressources, matière, année…'}
            </Text>
            <AppIcon name="filterOutline" size={20} color={C.textMuted} />
          </TouchableOpacity>

          <View style={styles.focusCardWrap}>
            <View style={[styles.focusCard, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
              <View style={[styles.heroAccentBolt, { backgroundColor: C.primary }]} />

              <View style={[styles.heroTopRow, isRTL && styles.rowReverse]}>
                <View style={styles.heroTextBlock}>
                  <Text style={[styles.heroLead, { color: C.textMuted }, isRTL && styles.rtlText]}>{heroLead}</Text>
                  <Text style={[styles.heroMain, { color: C.textPrimary }, isRTL && styles.rtlText]}>{heroMainLine}</Text>
                  <TouchableOpacity
                    style={[styles.heroCtaPill, { backgroundColor: C.primary }, Shadows.brand]}
                    onPress={() =>
                      (summary?.dueCards ?? 0) > 0 ? goToExplore('Flashcards') : goToExplore('Resources')
                    }
                    activeOpacity={0.88}
                  >
                    <Text style={styles.heroCtaPillText}>{heroCtaLabel}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.heroEmojiWrap, { backgroundColor: C.primarySurface }]}>
                  <Text style={styles.heroEmoji} allowFontScaling={false}>📚</Text>
                </View>
              </View>

              {/* Main stats (more legible) */}
              <View style={styles.focusStatsRow}>
                {([
                  {
                    key: 'resources',
                    icon: 'library' as const,
                    value: summary?.totalResources ?? 0,
                    label: t('home.stat.resources'),
                    onPress: () => goToExplore('Resources'),
                  },
                  {
                    key: 'reminders',
                    icon: 'alarm' as const,
                    value: summary?.todayReminders?.length ?? 0,
                    label: t('home.stat.reminders'),
                    onPress: () => goToExplore('Reminders'),
                  },
                  {
                    key: 'cards',
                    icon: 'albums' as const,
                    value: summary?.dueCards ?? 0,
                    label: t('home.stat.cards'),
                    onPress: () => goToExplore('Flashcards'),
                  },
                ]).map((kpi) => (
                  <GlassKpiCard
                    key={kpi.key}
                    icon={kpi.icon}
                    value={kpi.value}
                    label={kpi.label}
                    onPress={kpi.onPress}
                    rtl={isRTL}
                  />
                ))}
              </View>

              {/* XP + streak + next exam row */}
              {(() => {
                const streak = Math.max(localStreak, summary?.streakDays ?? 0);
                return (streak > 0 || summary?.xp || summary?.nextExam) ? (
                  <View style={styles.focusExtraRow}>
                    {streak > 0 && (() => {
                      const tierInfo = STREAK_TIERS.find(t => t.tier === streakTier);
                      const next = getNextTierTarget(streak);
                      return (
                        <GlassChip
                          text={
                            <>
                              {tierInfo ? tierInfo.emoji + ' ' : (streak >= 7 ? '🔥🔥' : '🔥') + ' '}
                              {streak} {lang === 'ar' ? 'يوم' : 'j'}
                              {freezeCount > 0 ? '  ❄️' : ''}
                            </>
                          }
                          subText={
                            next && streak < next.target
                              ? `${next.target - streak} ${lang === 'ar' ? 'يوماً لـ' : 'j →'}${next.emoji}`
                              : undefined
                          }
                        />
                      );
                    })()}
                    {(summary?.xp ?? 0) > 0 && (
                      <GlassChip text={`⭐ ${summary!.xp} XP`} />
                    )}
                    {todayFocus > 0 && (
                      <GlassChip text={`🍅 ${todayFocus} ${lang === 'ar' ? 'دقيقة' : 'min'}`} />
                    )}
                    {summary?.nextExam && (
                      <GlassChip
                        text={`📅 ${summary.nextExam.subject} · ${summary.nextExam.daysLeft}${lang === 'ar' ? 'ي' : 'j'}`}
                        onPress={() => goToTab('Profile')}
                      />
                    )}
                  </View>
                ) : null;
              })()}

              {/* Daily goal progress + 7-day dots */}
              {(() => {
                const pct = dailyGoal > 0 ? Math.min(1, Math.max(0, todayStudied / dailyGoal)) : 0;
                const studied = Math.min(todayStudied, dailyGoal);
                return (
                    <View style={styles.focusGoalRow}>
                    <TouchableOpacity
                      style={[styles.focusGoalWrap, { borderColor: C.borderLight, backgroundColor: C.surfaceVariant }]}
                      onPress={() => goToExplore('Flashcards')}
                      activeOpacity={0.78}
                    >
                      <View style={styles.focusGoalTop}>
                        <Text style={[styles.focusGoalLabel, { color: C.textPrimary }, isRTL && styles.rtlText]} numberOfLines={1}>
                          {lang === 'ar' ? '🎯 هدف اليوم' : '🎯 Objectif du jour'}
                        </Text>
                        <Text style={[styles.focusGoalValue, { color: C.primary }, isRTL && styles.rtlText]} numberOfLines={1}>
                          {studied}/{dailyGoal} {lang === 'ar' ? 'بطاقة' : 'cartes'}
                        </Text>
                      </View>
                      <View style={[styles.focusGoalTrack, { backgroundColor: C.border }]}>
                        <View style={[styles.focusGoalFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: C.primary }]} />
                      </View>
                    </TouchableOpacity>

                    <View style={styles.activityDotsWrap}>
                      {activityDots.length === 7 && activityDots.map((active, i) => (
                        <View key={i} style={[styles.activityDot, { backgroundColor: active ? C.primary : C.border }]} />
                      ))}
                    </View>
                  </View>
                );
              })()}
            </View>
          </View>
        </SafeAreaView>

        <View style={{ paddingHorizontal: Spacing.lg }}>

          {/* ── Home Tab Bar (3 categories) ─────────────────────────────── */}
          <View style={styles.homeTabsWrap}>
            {([
              { key: 'study' as const, label: lang === 'ar' ? 'الدراسة' : 'Étude' },
              { key: 'ai' as const, label: lang === 'ar' ? 'الذكاء' : 'IA' },
              { key: 'campus' as const, label: lang === 'ar' ? 'الحرم' : 'Campus' },
            ]).map(tab => {
              const active = homeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.homeTabBtn, active && styles.homeTabBtnActive]}
                  onPress={() => setHomeTab(tab.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.homeTabText, active && styles.homeTabTextActive]}>
                    {tab.label}
                  </Text>
                  {tab.key === 'study' && (summary?.dueCards ?? 0) > 0 && (
                    <View style={styles.homeTabBadge}>
                      <Text style={styles.homeTabBadgeText}>{summary!.dueCards}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Category content ────────────────────────────────────────── */}
          {homeTab === 'study' && (
            <Section
              title={lang === 'ar' ? 'أدوات الدراسة' : 'Outils d\'étude'}
              subtitle={lang === 'ar' ? 'اختَر أين تريد أن تذهب' : 'Choisis où tu veux avancer'}
              showMore={false}
            >
              <View style={styles.moduleList}>
                {STUDY_TILES.map(tile => (
                  <TouchableOpacity
                    key={tile.key}
                    style={[styles.moduleRow, isRTL && styles.rowReverse]}
                    onPress={tile.disabled ? undefined : tile.onPress}
                    activeOpacity={0.76}
                    disabled={tile.disabled}
                  >
                    <View style={[styles.moduleRowIcon, { backgroundColor: tile.color + '22', borderColor: tile.color + '35' }]}>
                      <AppIcon name={tile.icon} size={24} color={tile.color} />
                    </View>
                    <View style={styles.moduleRowBody}>
                      <Text style={[styles.moduleRowTitle, isRTL && styles.rtlText]} numberOfLines={2}>{tile.label}</Text>
                      {tile.badge ? (
                        <Text style={[styles.moduleRowBadge, { color: tile.color }, isRTL && styles.rtlText]}>{tile.badge}</Text>
                      ) : null}
                    </View>
                    {!tile.disabled && (
                      <AppIcon name={isRTL ? 'chevronBack' : 'chevronForward'} size={18} color={C.textMuted} />
                    )}
                    {tile.disabled && (
                      <View style={[styles.rowSoonBadge, { borderColor: C.border }]}>
                        <Text style={[styles.rowSoonText, { color: C.textMuted }]}>{t('common.soon')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </Section>
          )}

          {homeTab === 'ai' && (
            <View style={{ marginBottom: 22 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 }}>
                <View style={styles.aiSectionBadge}>
                  <Text style={styles.aiSectionBadgeText}>✨ AI</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.2 }}>
                  {lang === 'ar' ? 'الذكاء الاصطناعي' : 'Intelligence Artificielle'}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -Spacing.lg }}
              >
                <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: 10 }}>
                  {AI_TILES.map(tile => (
                    <FeatureCard
                      key={tile.key}
                      title={tile.label}
                      description={tile.description}
                      badgeText={tile.badge}
                      accentColor={tile.color}
                      disabled={tile.disabled}
                      onPress={tile.onPress}
                      width={280}
                      left={<Text style={{ fontSize: 22 }}>{tile.emoji}</Text>}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {homeTab === 'campus' && (
            <Section
              title={lang === 'ar' ? 'الحياة الجامعية' : 'Vie de campus'}
              subtitle={lang === 'ar' ? 'وظائف، سكن، فرص…' : 'Jobs, logement, opportunités…'}
              showMore={false}
            >
              <View style={styles.moduleList}>
                {COMMUNITY_TILES.map(tile => (
                  <TouchableOpacity
                    key={tile.key}
                    style={[styles.moduleRow, isRTL && styles.rowReverse]}
                    onPress={tile.disabled ? undefined : tile.onPress}
                    activeOpacity={0.76}
                    disabled={tile.disabled}
                  >
                    <View style={[styles.moduleRowIcon, { backgroundColor: tile.color + '22', borderColor: tile.color + '35' }]}>
                      <AppIcon name={tile.icon} size={24} color={tile.color} />
                    </View>
                    <View style={styles.moduleRowBody}>
                      <Text style={[styles.moduleRowTitle, isRTL && styles.rtlText]} numberOfLines={2}>{tile.label}</Text>
                    </View>
                    {!tile.disabled && (
                      <AppIcon name={isRTL ? 'chevronBack' : 'chevronForward'} size={18} color={C.textMuted} />
                    )}
                    {tile.disabled && (
                      <View style={[styles.rowSoonBadge, { borderColor: C.border }]}>
                        <Text style={[styles.rowSoonText, { color: C.textMuted }]}>{t('common.soon')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </Section>
          )}

          {/* ── Recently Viewed Resources ────────────────────────────────── */}
          {recentlyViewed.length > 0 && (
            <Section
              title={lang === 'ar' ? 'آخر ما شاهدته' : 'Récemment consultés'}
              onMore={() => goToExplore('Resources')}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.lg }}>
                <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: 10 }}>
                  {recentlyViewed.map(r => {
                    const color = RES_COLORS[r.type] ?? Colors.modules.profile;
                    const icon  = RES_ICONS[r.type]  ?? 'documentOutline';
                    return (
                      <TouchableOpacity
                        key={r.id}
                        style={styles.recentCard}
                        onPress={() => {
                          const root = (navigation as any)?.getParent?.()?.getParent?.();
                          if (root?.navigate) {
                            root.navigate('ExploreModal', {
                              screen: 'Resources',
                              params: {
                                screen: 'ResourceDetail',
                                params: { resource: r },
                              },
                            });
                          } else {
                            navigation.navigate('Explore' as any, {
                              screen: 'Resources',
                              params: {
                                screen: 'ResourceDetail',
                                params: { resource: r },
                              },
                            } as any);
                          }
                        }}
                        activeOpacity={0.78}
                      >
                        <View style={[styles.recentIconBox, { backgroundColor: color + '22' }]}>
                          <AppIcon name={icon} size={18} color={color} />
                        </View>
                        <Text style={styles.recentTitle} numberOfLines={2}>
                          {r.titleAr || r.title}
                        </Text>
                        <Text style={[styles.recentSubject, { color }]} numberOfLines={1}>
                          {r.subject}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </Section>
          )}

          {/* ── 28-Day Study Heatmap (GitHub-style contribution graph) ────── */}
          {heatmapData.length === 28 && (
            <Section
              title={lang === 'ar' ? '🗓 28 يوم من الدراسة' : '🗓 28 jours d\'activité'}
              showMore={false}
            >
              {(() => {
                const todayStr = new Date().toISOString().slice(0, 10);
                // 4 rows × 7 cols — left to right, oldest first
                return (
                  <View style={{ gap: 4 }}>
                    {[0, 1, 2, 3].map(row => (
                      <View key={row} style={{ flexDirection: 'row', gap: 4 }}>
                        {heatmapData.slice(row * 7, row * 7 + 7).map((d, ci) => {
                          const score = d.cards + Math.floor(d.focus / 5);
                          const bg = score === 0 ? C.border
                            : score < 4  ? Colors.primary + '38'
                            : score < 10 ? Colors.primary + '70'
                            : Colors.primary;
                          const isToday = d.date === todayStr;
                          return (
                            <View
                              key={d.date}
                              style={[
                                styles.heatCell,
                                { backgroundColor: bg },
                                isToday && { borderWidth: 1.5, borderColor: Colors.primary },
                              ]}
                            />
                          );
                        })}
                      </View>
                    ))}
                    {/* Legend */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                      <Text style={{ fontSize: 10, color: C.textMuted }}>
                        {lang === 'ar' ? 'أقل' : 'Moins'}
                      </Text>
                      {[C.border, Colors.primary + '38', Colors.primary + '70', Colors.primary].map((c, i) => (
                        <View key={i} style={[styles.heatCell, { backgroundColor: c }]} />
                      ))}
                      <Text style={{ fontSize: 10, color: C.textMuted }}>
                        {lang === 'ar' ? 'أكثر' : 'Plus'}
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </Section>
          )}

          {/* ── Mode Examen Widget ─────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.examWidget}
            onPress={() => navigation.navigate('Profile', { screen: 'ExamCountdown' } as any)}
            activeOpacity={0.85}
          >
            {summary?.nextExam ? (
              <>
                <View style={[styles.examWidgetAccent, { backgroundColor: summary.nextExam.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.examWidgetLabel}>
                    {lang === 'ar' ? '📌 الامتحان القادم' : '📌 Prochain examen'}
                  </Text>
                  <Text style={styles.examWidgetSubject} numberOfLines={1}>
                    {summary.nextExam.subject}
                  </Text>
                </View>
                <View style={[styles.examCountdownBubble, { backgroundColor: summary.nextExam.color + '18' }]}>
                  <Text style={[styles.examCountdownNum, { color: summary.nextExam.color }]}>
                    {summary.nextExam.daysLeft}
                  </Text>
                  <Text style={[styles.examCountdownUnit, { color: summary.nextExam.color }]}>
                    {lang === 'ar' ? 'يوم' : 'j'}
                  </Text>
                </View>
                <AppIcon name="chevronForward" size={16} color="#9CA3AF" style={{ marginLeft: 4 }} />
              </>
            ) : (
              <>
                <View style={[styles.examWidgetAccent, { backgroundColor: C.primary }]} />
                <AppIcon name="calendarOutline" size={20} color={C.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.examWidgetLabel, { flex: 1, color: '#6B7280' }]}>
                  {lang === 'ar' ? 'أضف امتحاناتك — ابدأ العد التنازلي ⏳' : 'Ajouter tes examens — lance le compte à rebours ⏳'}
                </Text>
                <AppIcon name="addCircle" size={22} color={C.primary} />
              </>
            )}
          </TouchableOpacity>

          {(summary?.todayReminders?.length ?? 0) > 0 && (
            <Section title={t('home.section.today')} onMore={() => goToExplore('Reminders')}>
              {summary!.todayReminders.map(r => {
                const col = r.courseColor ?? REMINDER_COLORS[r.reminderType] ?? '#6B7280';
                return (
                  <View key={r.id} style={styles.timelineRow}>
                    {/* Left accent bar */}
                    <View style={[styles.timelineBar, { backgroundColor: col }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reminderTitle} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.reminderMeta}>
                        {REMINDER_LABELS[r.reminderType] ?? r.reminderType} · {formatTime(r.scheduledAt)}
                      </Text>
                    </View>
                    <View style={[styles.reminderTimePill, { backgroundColor: col + '18' }]}>
                      <Text style={[styles.reminderTimeText, { color: col }]}>
                        {formatTime(r.scheduledAt)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Section>
          )}

          {/* ── Due flashcard decks ──────────────────────────────────────── */}
          {(summary?.recentDecks?.length ?? 0) > 0 && (
            <Section title={t('home.section.decks')} onMore={() => goToExplore('Flashcards')}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.lg }}>
                <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: 12 }}>
                  {summary!.recentDecks.map(deck => (
                    <TouchableOpacity
                      key={deck.id}
                      style={[styles.deckCard, { borderTopColor: deck.color }]}
                      onPress={() => goToExplore('Flashcards')}
                      activeOpacity={0.78}
                    >
                      <View style={[styles.deckColorBar, { backgroundColor: deck.color }]} />
                      <Text style={styles.deckTitle} numberOfLines={2}>{deck.title}</Text>
                      {deck.dueCount > 0 ? (
                        <View style={[styles.duePill, { backgroundColor: deck.color + '22' }]}>
                          <Text style={[styles.duePillText, { color: deck.color }]}>
                            {deck.dueCount} {t('home.due_review')}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.donePill}>
                          <Text style={styles.donePillText}>{t('home.completed')}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </Section>
          )}

          {/* ── Empty state ──────────────────────────────────────────────── */}
          {(summary?.dueCards === 0 && summary?.todayReminders?.length === 0) && (
            <View style={styles.emptyBanner}>
              <Text style={{ fontSize: 38 }}>🎉</Text>
              <Text style={styles.emptyTitle}>{t('home.empty.title')}</Text>
              <Text style={styles.emptySubtitle}>{t('home.empty.sub')}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Section = ({
  title,
  subtitle,
  children,
  onMore,
  showMore = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onMore?: () => void;
  showMore?: boolean;
}) => {
  const { t } = useLanguage();
  const { colors: C } = useTheme();
  return (
    <View style={{ marginBottom: 22 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: subtitle ? 'flex-start' : 'center',
          marginBottom: subtitle ? 10 : 12,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1, minWidth: 0, gap: 12 }}>
          <View style={{ width: 4, borderRadius: 2, alignSelf: 'stretch', marginTop: 3, backgroundColor: C.primary, minHeight: 22 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: C.textPrimary, letterSpacing: -0.45 }}>{title}</Text>
          {subtitle ? (
            <Text
              style={{
                fontSize: 13,
                fontWeight: '500',
                color: C.textSecondary,
                marginTop: 4,
                lineHeight: 18,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
          </View>
        </View>
        {showMore && onMore && (
          <TouchableOpacity onPress={onMore} activeOpacity={0.7}>
            <Text style={{ fontSize: 13, color: C.primary, fontWeight: '600' }}>{t('home.see_all')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  rtlText: {
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },

  /* App bar + search (Soft UI) */
  appBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 4,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  appBarTextCol: {
    flex: 1,
    minWidth: 0,
  },
  appBarHello: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.2,
  },
  appBarName: {
    fontSize: 24,
    fontWeight: '900',
    color: C.textPrimary,
    letterSpacing: -0.6,
    marginTop: 2,
  },
  appBarTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appBarIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBarNotifDot: {
    position: 'absolute',
    top: 9,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: C.surfaceVariant,
  },
  appBarAvatarBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.primarySurface,
    borderWidth: 2,
    borderColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBarAvatarTxt: {
    fontSize: 18,
    fontWeight: '900',
    color: C.primary,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    gap: Spacing.sm,
    backgroundColor: C.surfaceVariant,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  searchPillPlaceholder: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: C.textMuted,
  },

  /* Hero banner — carte éditoriale (surface) */
  focusCardWrap: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius['2xl'],
    overflow: 'visible',
    ...Shadows.md,
  },
  focusCard: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    position: 'relative',
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroAccentBolt: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderBottomLeftRadius: BorderRadius['2xl'],
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: Spacing.sm,
  },
  heroTextBlock: { flex: 1, minWidth: 0 },
  heroLead: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },
  heroMain: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.65,
    lineHeight: 28,
  },
  heroCtaPill: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: BorderRadius.pill,
  },
  heroCtaPillText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  heroEmojiWrap: {
    width: 58,
    height: 58,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.primarySoft,
  },
  heroEmoji: {
    fontSize: 32,
    lineHeight: 36,
  },

  /* Stats row */
  focusStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  // focusStat* moved to `GlassKpiCard`

  focusExtraRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  // extraChip* moved to `GlassChip`

  /* Daily Goal + Activity Dots */
  focusGoalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12 },
  focusGoalWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  focusGoalTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  focusGoalLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.15 },
  focusGoalValue: { fontSize: 11, fontWeight: '900' },
  focusGoalTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  focusGoalFill: {
    height: '100%',
    borderRadius: 999,
  },
  activityDotsWrap:  { flexDirection: 'row', gap: 7, alignItems: 'center' },
  activityDot:       { width: 11, height: 11, borderRadius: 6 },

  /* Recently viewed resource cards */
  recentCard: {
    width: 124,
    backgroundColor: C.surface,
    borderRadius: BorderRadius.card,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: C.borderLight,
    ...Shadows.sm,
  },
  recentIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentTitle:   { fontSize: 12, fontWeight: '700', color: C.textPrimary, lineHeight: 17 },
  recentSubject: { fontSize: 11, fontWeight: '600' },

  /* 28-Day Heatmap */
  heatCell: {
    flex: 1, aspectRatio: 1, borderRadius: 4,
    minWidth: 0,
  },

  /* AI section badge */
  aiSectionBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.sm,
    backgroundColor: C.primarySurface,
    borderWidth: 1,
    borderColor: C.primarySoft,
  },
  aiSectionBadgeText: { fontSize: 10, fontWeight: '900', color: C.primary, letterSpacing: 1 },

  /* Home tabs — soulignement (pas capsules) */
  homeTabsWrap: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    marginBottom: 18,
    gap: 4,
    backgroundColor: 'transparent',
  },
  homeTabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  homeTabBtnActive: {
    borderBottomColor: C.primary,
  },
  homeTabText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.15,
  },
  homeTabTextActive: {
    color: C.textPrimary,
  },
  homeTabBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  homeTabBadgeText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },

  /* AI tiles */
  // AI cards now use `FeatureCard` (kept styles removed)

  /* Community tiles */
  communityTile: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: BorderRadius.card, borderWidth: 1, borderColor: C.borderLight,
    padding: 16, gap: 10,
    shadowColor: '#0F0A1F', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  moduleList: { gap: 10 },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: C.borderLight,
    ...Shadows.xs,
  },
  moduleRowIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  moduleRowBody: { flex: 1, minWidth: 0 },
  moduleRowTitle: { fontSize: 15, fontWeight: '900', color: C.textPrimary, letterSpacing: -0.35, lineHeight: 21 },
  moduleRowBadge: { marginTop: 4, fontSize: 13, fontWeight: '800' },
  rowSoonBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  rowSoonText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.35, textTransform: 'uppercase' },

  /* Section (kept for compat) */
  section: { marginBottom: 22 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.2 },
  sectionMore:  { fontSize: 13, color: C.primary, fontWeight: '600' },

  /* Timeline reminders */
  timelineRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.borderLight,
    overflow: 'hidden', marginBottom: 8, gap: 12,
    paddingRight: 14, paddingVertical: 14,
    shadowColor: '#0F0A1F', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  timelineBar: { width: 5, alignSelf: 'stretch', borderRadius: 0 },
  reminderTitle:    { fontSize: 14, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.1 },
  reminderMeta:     { fontSize: 11, color: C.textMuted, marginTop: 3, fontWeight: '600' },
  reminderTimePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.pill },
  reminderTimeText: { fontSize: 11, fontWeight: '800' },

  /* Deck cards */
  deckCard: {
    width: 150, backgroundColor: C.surface, borderRadius: BorderRadius.card,
    padding: 14, borderTopWidth: 4, gap: 8,
    borderWidth: 1, borderColor: C.borderLight,
    shadowColor: '#0F0A1F', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  deckColorBar: { width: 32, height: 5, borderRadius: 3 },
  deckTitle:    { fontSize: 13, fontWeight: '800', color: C.textPrimary, lineHeight: 18, letterSpacing: -0.1 },
  duePill: { borderRadius: BorderRadius.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  duePillText: { fontSize: 11, fontWeight: '800' },
  donePill: { backgroundColor: C.successSurface, borderRadius: BorderRadius.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  donePillText: { fontSize: 11, fontWeight: '800', color: C.success },

  /* Empty */
  emptyBanner: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderRadius: 24,
    padding: 32, gap: 10, marginTop: 8,
    borderWidth: 1, borderColor: C.borderLight,
    shadowColor: '#0F0A1F', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  emptyTitle:    { fontSize: 20, fontWeight: '900', color: C.textPrimary, letterSpacing: -0.3 },
  emptySubtitle: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20, fontWeight: '500' },

  /* Exam Countdown Widget */
  examWidget: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 20, borderWidth: 1, borderColor: C.borderLight,
    overflow: 'hidden', marginBottom: 22,
    paddingVertical: 16, paddingRight: 16,
    shadowColor: '#0F0A1F', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  examWidgetAccent:  { width: 5, alignSelf: 'stretch', borderRadius: 0, marginRight: 14 },
  examWidgetLabel:   { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  examWidgetSubject: { fontSize: 16, fontWeight: '900', color: C.textPrimary, letterSpacing: -0.2 },
  examCountdownBubble: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, marginLeft: 12,
    minWidth: 64,
  },
  examCountdownNum:  { fontSize: 28, fontWeight: '900', lineHeight: 32, letterSpacing: -0.8 },
  examCountdownUnit: { fontSize: 11, fontWeight: '800', marginTop: 2 },
});
