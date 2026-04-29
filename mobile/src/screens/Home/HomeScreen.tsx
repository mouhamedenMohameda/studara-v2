import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { HomeSummary } from '../../types';
import { Colors, Gradients, Spacing, BorderRadius } from '../../theme';
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
  assignment: '#7C3AED',
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
  note: '#8B5CF6', past_exam: '#EF4444', summary: '#10B981',
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

  const { data: summary, isLoading: loading, isRefetching: refreshing, refetch } = useQuery({
    queryKey: queryKeys.home(),
    queryFn: () => apiRequest<HomeSummary>('/home/summary', { token: token! }),
    enabled: !!token,
  });

  const [paygActiveByKey, setPaygActiveByKey] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!token) return;
    apiRequest<any[]>('/billing/features', { token })
      .then((rows) => {
        const map: Record<string, boolean> = {};
        for (const r of Array.isArray(rows) ? rows : []) {
          map[String(r.key)] = !!r.is_active;
        }
        setPaygActiveByKey(map);
      })
      .catch(() => {});
  }, [token]);

  const [appActiveByKey, setAppActiveByKey] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!token) return;
    apiRequest<any[]>('/billing/app-features', { token })
      .then((rows) => {
        const map: Record<string, boolean> = {};
        for (const r of Array.isArray(rows) ? rows : []) {
          map[String(r.key)] = !!r.is_active;
        }
        setAppActiveByKey(map);
      })
      .catch(() => {});
  }, [token]);

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
    refetch();
  }, [refetch]));

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

  const goToExplore = useCallback((screen: 'Resources' | 'Timetable' | 'Courses' | 'Flashcards' | 'Jobs' | 'Reminders' | 'Housing') => {
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
      key: 'daily', icon: 'gameControllerOutline' as const, color: '#7C3AED',
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
      color: '#10B981',
      gradientColors: ['#059669', '#10B981'] as [string, string],
      label: lang === 'ar' ? 'مساعدك الذكي' : 'Assistant IA',
      description: lang === 'ar' ? 'مساعدك الذكي' : 'Ton assistant IA',
      emoji: '🤖',
      badge: t('common.soon'),
      disabled: !(appActiveByKey.askzad ?? false),
      onPress: () => navigation.navigate('AskZad' as any),
    },
    {
      key: 'whisper',
      icon: 'micOutline' as const,
      color: '#7C3AED',
      gradientColors: ['#6D28D9', '#7C3AED'] as [string, string],
      label: lang === 'ar' ? 'ويسبر' : 'Whisper',
      description: lang === 'ar' ? 'تحويل الصوت لنص' : 'Transcription vocale',
      emoji: '🎙️',
      disabled: !(appActiveByKey.whisper ?? true),
      onPress: () => navigation.navigate('VoiceNotes' as any),
    },
    {
      key: 'ai_summary',
      icon: 'sparkles' as const,
      color: '#7C3AED',
      gradientColors: ['#7C3AED', '#5B21B6'] as [string, string],
      label: lang === 'ar' ? '✨ ملخص ذكي' : '✨ Résumé intelligent',
      description: lang === 'ar' ? 'PDF/صورة → ملخص + PDF' : 'PDF/image → résumé + PDF',
      emoji: '📄',
      badge: t('common.soon'),
      disabled: !(appActiveByKey.ai_summary ?? false) || !(paygActiveByKey.ai_summary ?? false),
      onPress: () => {
        const root = (navigation as any)?.getParent?.()?.getParent?.();
        if (root?.navigate) root.navigate('AISummaryImport');
        else navigation.navigate('AISummaryImport' as any);
      },
    },
    {
      key: 'ai_exercise_correction',
      icon: 'schoolOutline' as const,
      color: '#2563EB',
      gradientColors: ['#2563EB', '#0EA5E9'] as [string, string],
      label: lang === 'ar' ? '✅ تصحيح تمارين' : '✅ Correction IA',
      description: lang === 'ar' ? 'صورة/نص → حل مفصل + PDF' : 'Photo/texte → correction + PDF',
      emoji: '✅',
      badge: t('common.soon'),
      disabled: !(appActiveByKey.ai_exercise_correction ?? false) || !(paygActiveByKey.ai_exercise_correction ?? false),
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Focus Card ─────────────────────────────────────────────────── */}
        <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
          <TouchableOpacity
            onPress={() => goToTab('Profile')}
            activeOpacity={0.96}
            style={styles.focusCardWrap}
          >
            <LinearGradient
              colors={Gradients.brand}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={styles.focusCard}
            >
              {/* Decorative layers (glass + blobs) */}
              <View pointerEvents="none" style={styles.focusDecorWrap}>
                <View style={styles.focusGlass} />
                <View style={styles.focusBlobA} />
                <View style={styles.focusBlobB} />
                <View style={styles.focusBlobC} />
              </View>

              {/* Top row: greeting + profile circle */}
              <View style={styles.focusTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.focusGreeting, isRTL && styles.rtlText]}>{greeting}</Text>
                  <Text style={[styles.focusName, isRTL && styles.rtlText]} numberOfLines={1}>
                    {firstName}
                  </Text>
                </View>
                <View style={styles.focusAvatar}>
                  <Text style={styles.focusAvatarText}>{firstName.charAt(0)}</Text>
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
                      style={styles.focusGoalWrap}
                      onPress={() => goToExplore('Flashcards')}
                      activeOpacity={0.78}
                    >
                      <View style={styles.focusGoalTop}>
                        <Text style={[styles.focusGoalLabel, isRTL && styles.rtlText]} numberOfLines={1}>
                          {lang === 'ar' ? '🎯 هدف اليوم' : '🎯 Objectif du jour'}
                        </Text>
                        <Text style={[styles.focusGoalValue, isRTL && styles.rtlText]} numberOfLines={1}>
                          {studied}/{dailyGoal} {lang === 'ar' ? 'بطاقة' : 'cartes'}
                        </Text>
                      </View>
                      <View style={styles.focusGoalTrack}>
                        <View style={[styles.focusGoalFill, { width: `${Math.round(pct * 100)}%` }]} />
                      </View>
                    </TouchableOpacity>

                    <View style={styles.activityDotsWrap}>
                      {activityDots.length === 7 && activityDots.map((active, i) => (
                        <View key={i} style={[styles.activityDot, active && styles.activityDotFull]} />
                      ))}
                    </View>
                  </View>
                );
              })()}
            </LinearGradient>
          </TouchableOpacity>
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
            <Section title={lang === 'ar' ? 'أدوات الدراسة' : 'Outils d\'étude'} showMore={false}>
              <View style={styles.moduleGrid}>
                {STUDY_TILES.map(tile => (
                  <TouchableOpacity
                    key={tile.key}
                    style={styles.moduleTile}
                    onPress={tile.disabled ? undefined : tile.onPress}
                    activeOpacity={0.78}
                    disabled={tile.disabled}
                  >
                    <View style={[styles.tileIconBox, { backgroundColor: tile.color + '18' }]}>
                      <AppIcon name={tile.icon} size={22} color={tile.color} />
                    </View>
                    <Text style={styles.tileLabel} numberOfLines={1}>{tile.label}</Text>
                    {tile.badge && (
                      <View style={[styles.tileBadge, { backgroundColor: tile.color + '20' }]}>
                        <Text style={[styles.tileBadgeText, { color: tile.color }]}>{tile.badge}</Text>
                      </View>
                    )}
                    {tile.disabled && (
                      <View style={styles.soonOverlay} pointerEvents="none">
                        <Text style={styles.soonText}>{t('common.soon')}</Text>
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
                      gradientColors={tile.gradientColors}
                      disabled={tile.disabled}
                      onPress={tile.onPress}
                      width={260}
                      left={<Text style={{ fontSize: 22 }}>{tile.emoji}</Text>}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {homeTab === 'campus' && (
            <Section title={lang === 'ar' ? 'الحياة الجامعية' : 'Campus'} showMore={false}>
              <View style={styles.moduleGrid}>
                {COMMUNITY_TILES.map(tile => (
                  <TouchableOpacity
                    key={tile.key}
                    style={styles.moduleTile}
                    onPress={tile.disabled ? undefined : tile.onPress}
                    activeOpacity={0.78}
                    disabled={tile.disabled}
                  >
                    <View style={[styles.tileIconBox, { backgroundColor: tile.color + '18' }]}>
                      <AppIcon name={tile.icon} size={22} color={tile.color} />
                    </View>
                    <Text style={styles.tileLabel} numberOfLines={1}>{tile.label}</Text>
                    {tile.disabled && (
                      <View style={styles.soonOverlay} pointerEvents="none">
                        <Text style={styles.soonText}>{t('common.soon')}</Text>
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
                    const color = RES_COLORS[r.type] ?? '#8B5CF6';
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
                <View style={[styles.examWidgetAccent, { backgroundColor: '#7C3AED' }]} />
                <AppIcon name="calendarOutline" size={20} color="#7C3AED" style={{ marginRight: 10 }} />
                <Text style={[styles.examWidgetLabel, { flex: 1, color: '#6B7280' }]}>
                  {lang === 'ar' ? 'أضف امتحاناتك — ابدأ العد التنازلي ⏳' : 'Ajouter tes examens — lance le compte à rebours ⏳'}
                </Text>
                <AppIcon name="addCircle" size={22} color="#7C3AED" />
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
  title, children, onMore, showMore = true,
}: {
  title: string; children: React.ReactNode;
  onMore?: () => void; showMore?: boolean;
}) => {
  const { t } = useLanguage();
  const { colors: C } = useTheme();
  return (
    <View style={{ marginBottom: 22 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.2 }}>{title}</Text>
        {showMore && onMore && (
          <TouchableOpacity onPress={onMore} activeOpacity={0.7}>
            <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>{t('home.see_all')}</Text>
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

  /* Focus Card */
  focusCardWrap: {
    margin: Spacing.lg,
    marginTop: 14,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.32,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  focusCard: { padding: 22, position: 'relative' },
  focusDecorWrap: { ...StyleSheet.absoluteFillObject },
  focusGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  focusBlobA: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 999,
    top: -120, right: -90,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  focusBlobB: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 999,
    bottom: -160, left: -120,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  focusBlobC: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 999,
    bottom: -40, right: 18,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },

  focusTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  focusGreeting: { fontSize: 12, color: 'rgba(255,255,255,0.86)', fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  focusName: { fontSize: 34, fontWeight: '900', color: '#FFFFFF', marginTop: 4, letterSpacing: -1.1 },
  focusAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  focusAvatarText: { fontSize: 20, fontWeight: '900', color: '#fff' },

  /* Stats row */
  focusStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
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
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  focusGoalTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  focusGoalLabel: { fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.1 },
  focusGoalValue: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.92)' },
  focusGoalTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  focusGoalFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    opacity: 0.92,
  },
  activityDotsWrap:  { flexDirection: 'row', gap: 6, alignItems: 'center' },
  activityDot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.22)' },
  activityDotFull:   { backgroundColor: 'rgba(255,255,255,0.92)' },

  /* Recently viewed resource cards */
  recentCard: {
    width: 120, backgroundColor: C.surface, borderRadius: BorderRadius.card,
    padding: 11, gap: 6, borderWidth: 1, borderColor: C.border,
  },
  recentIconBox: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
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
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  aiSectionBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },

  /* Home tabs (Étude / IA / Campus) */
  homeTabsWrap: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 999,
    padding: 6,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 6,
    marginBottom: 16,
  },
  homeTabBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  homeTabBtnActive: {
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primarySoft,
  },
  homeTabText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  homeTabTextActive: {
    color: Colors.primary,
  },
  homeTabBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
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
    borderRadius: 20, borderWidth: 1, borderColor: C.borderLight,
    padding: 16, gap: 10,
    shadowColor: '#0F0A1F', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  /* Module grid */
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moduleTile: {
    width: '47.5%',
    backgroundColor: C.surface,
    borderRadius: 20, borderWidth: 1, borderColor: C.borderLight,
    padding: 16, gap: 10,
    shadowColor: '#0F0A1F', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'hidden',
  },
  tileIconBox: {
    width: 46, height: 46, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  tileLabel: { fontSize: 13, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.1 },
  tileBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 999,
  },
  tileBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.2 },

  soonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

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
