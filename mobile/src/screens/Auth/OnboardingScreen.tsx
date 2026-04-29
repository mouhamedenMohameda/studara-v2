import React, { useRef, useState } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Gradients, Shadows } from '../../theme';
import { useFaculties } from '../../hooks/useFaculties';
import { Faculty } from '../../types';
import { setFavoriteFaculty } from '../../utils/offlineStorage';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'resources',
    step: '01',
    emoji: '📚',
    accentColor: Colors.modules.resources,
    title: 'موارد أكاديمية',
    subtitle: 'آلاف الملخصات والامتحانات السابقة من جامعات موريتانيا.',
    skeletonType: 'list' as const,
  },
  {
    key: 'timetable',
    step: '02',
    emoji: '🗓️',
    accentColor: Colors.modules.timetable,
    title: 'جدول دراسي ذكي',
    subtitle: 'نظّم أسبوعك، سجّل محاضراتك واحتفظ ببياناتك دون اتصال.',
    skeletonType: 'grid' as const,
  },
  {
    key: 'reminders',
    step: '03',
    emoji: '⏰',
    accentColor: Colors.modules.reminders,
    title: 'تذكيرات أذكياء',
    subtitle: 'لا تفوّت امتحاناً أو واجباً. تابع تقدّمك يوماً بيوم.',
    skeletonType: 'timeline' as const,
  },
  {
    key: 'faculty',
    step: '04',
    emoji: '🎓',
    accentColor: '#7C3AED',
    title: 'ما هي كليتك؟',
    subtitle: 'سنعرض لك أولاً الموارد الأنسب لتخصصك الدراسي.',
    skeletonType: 'faculty' as const,
  },
];

const OnboardingScreen = () => {
  const { completeOnboarding } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const faculties = useFaculties();
  const scrollRef = useRef<ScrollView>(null);

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setActiveIndex(index);
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) goTo(activeIndex + 1);
    else handleFinish();
  };

  const handleFinish = async () => {
    if (selectedFaculty) {
      await setFavoriteFaculty(selectedFaculty).catch(() => {});
    }
    await completeOnboarding();
  };

  const slide = SLIDES[activeIndex];
  const progress = ((activeIndex + 1) / SLIDES.length) * 100;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleFinish} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skipText}>تخطي</Text>
          </TouchableOpacity>
          <View style={styles.dotsRow}>
            {SLIDES.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => goTo(i)}>
                <View style={[
                  styles.dot,
                  i === activeIndex && styles.dotActive,
                  i < activeIndex && styles.dotDone,
                ]} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
          style={{ flex: 1 }}
        >
          {SLIDES.map((s) => (
            <View key={s.key} style={[styles.slide, { width }]}>
              {/* Step number */}
              <Text style={[styles.stepNum, { color: s.accentColor + '40' }]}>{s.step}</Text>

              {/* Fake UI skeleton mockup */}
              <View style={[styles.mockup, { borderColor: s.accentColor + '30' }]}>
                {/* Header bar */}
                <View style={[styles.mockupHeader, { backgroundColor: s.accentColor + '18' }]}>
                  <View style={[styles.mockupDot, { backgroundColor: s.accentColor }]} />
                  <View style={[styles.mockupBar, { width: 80, backgroundColor: s.accentColor + '60' }]} />
                  <View style={{ flex: 1 }} />
                  <View style={[styles.mockupBadge, { backgroundColor: s.accentColor + '25' }]}>
                    <View style={[styles.mockupBar, { width: 24, backgroundColor: s.accentColor }]} />
                  </View>
                </View>
                {/* Skeleton rows */}
                {s.skeletonType === 'list' && [
                  { w1: 120, w2: 60, op: 1 },
                  { w1: 90, w2: 45, op: 0.65 },
                  { w1: 110, w2: 55, op: 0.4 },
                ].map((row, i) => (
                  <View key={i} style={styles.mockupRow}>
                    <View style={[styles.mockupIcon, { backgroundColor: s.accentColor + '20' }]} />
                    <View style={{ flex: 1, gap: 5 }}>
                      <View style={[styles.mockupBar, { width: row.w1, opacity: row.op, backgroundColor: Colors.border }]} />
                      <View style={[styles.mockupBar, { width: row.w2, opacity: row.op * 0.6, backgroundColor: Colors.border }]} />
                    </View>
                  </View>
                ))}
                {s.skeletonType === 'grid' && (
                  <View style={styles.mockupGrid}>
                    {['M','T','W','T','F'].map((d, i) => (
                      <View key={i} style={styles.mockupGridCol}>
                        <Text style={[styles.mockupGridLabel, { color: Colors.textMuted }]}>{d}</Text>
                        <View style={[styles.mockupGridCell, i === 1 && { backgroundColor: s.accentColor + '30', borderColor: s.accentColor }]} />
                        <View style={[styles.mockupGridCell, i === 3 && { backgroundColor: s.accentColor + '30', borderColor: s.accentColor }]} />
                      </View>
                    ))}
                  </View>
                )}
                {s.skeletonType === 'timeline' && [
                  { label: 'امتحان', color: '#DC2626' },
                  { label: 'واجب', color: '#7C3AED' },
                  { label: 'محاضرة', color: s.accentColor },
                ].map((item, i) => (
                  <View key={i} style={styles.mockupTimeline}>
                    <View style={[styles.mockupTimelineDot, { backgroundColor: item.color }]} />
                    <View style={[styles.mockupBar, { flex: 1, opacity: 0.7, backgroundColor: item.color + '40' }]} />
                    <View style={[styles.mockupBadge, { backgroundColor: item.color + '20' }]}>
                      <View style={[styles.mockupBar, { width: 30, backgroundColor: item.color }]} />
                    </View>
                  </View>
                ))}
                {s.skeletonType === 'faculty' && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6, paddingHorizontal: 2 }}>
                    {faculties.map((f) => {
                      const isSelected = selectedFaculty === f.slug;
                      return (
                        <TouchableOpacity
                          key={f.slug}
                          style={[styles.facChip, isSelected && styles.facChipActive]}
                          onPress={() => setSelectedFaculty(f.slug as Faculty)}
                          activeOpacity={0.75}
                        >
                          <Text style={{ fontSize: 16 }}>{f.icon}</Text>
                          <Text style={[styles.facChipText, isSelected && styles.facChipTextActive]}>
                            {f.name_ar}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Text */}
              <View style={styles.textBlock}>
                <Text style={styles.slideTitle}>{s.title}</Text>
                <Text style={styles.slideSubtitle}>{s.subtitle}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` as `${number}%` }]} />
        </View>

        {/* CTA row */}
        <View style={styles.ctaRow}>
          {activeIndex > 0 && (
            <TouchableOpacity style={styles.prevBtn} onPress={() => goTo(activeIndex - 1)} activeOpacity={0.75}>
              <AppIcon name="arrowForward" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.nextBtnWrap} onPress={handleNext} activeOpacity={0.88}>
            <LinearGradient
              colors={Gradients.brand as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextBtn}
            >
              <Text style={styles.nextText}>
                {activeIndex === SLIDES.length - 1 ? 'ابدأ الآن 🚀' : 'التالي'}
              </Text>
              {activeIndex < SLIDES.length - 1 && (
                <View style={styles.nextArrow}>
                  <AppIcon name="arrowBack" size={18} color={Colors.primary} />
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 8,
  },
  skipText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600', width: 44 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: Colors.border,
  },
  dotActive: { width: 24, backgroundColor: Colors.primary, borderRadius: 4 },
  dotDone: { backgroundColor: Colors.primaryLight },

  /* Slide */
  slide: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 0,
    justifyContent: 'center',
    gap: 0,
  },
  stepNum: {
    fontSize: 84, fontWeight: '900', letterSpacing: -5,
    alignSelf: 'flex-start',
    marginBottom: -10,
  },

  /* Mockup card */
  mockup: {
    width: '100%', borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: Colors.background,
    padding: 14, gap: 10,
    // soft shadow
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    marginBottom: 28,
  },
  mockupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, padding: 10,
  },
  mockupDot:   { width: 10, height: 10, borderRadius: 5 },
  mockupBar:   { height: 8, borderRadius: 4 },
  mockupBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  mockupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6, paddingHorizontal: 4,
  },
  mockupIcon: { width: 36, height: 36, borderRadius: 10 },
  mockupGrid: { flexDirection: 'row', gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  mockupGridCol: { flex: 1, alignItems: 'center', gap: 5 },
  mockupGridLabel: { fontSize: 10, fontWeight: '700' },
  mockupGridCell: {
    width: '100%', height: 32, borderRadius: 6,
    backgroundColor: Colors.surfaceWarm,
    borderWidth: 1, borderColor: Colors.border,
  },
  mockupTimeline: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 4, paddingVertical: 6,
  },
  mockupTimelineDot: { width: 12, height: 12, borderRadius: 6 },

  /* Text block */
  textBlock: { gap: 8, paddingHorizontal: 4 },
  slideTitle: {
    fontSize: 34, fontWeight: '900', color: Colors.textPrimary,
    textAlign: 'right', letterSpacing: -0.9, lineHeight: 42,
  },
  slideSubtitle: {
    fontSize: 15, color: Colors.textSecondary,
    textAlign: 'right', lineHeight: 24, fontWeight: '500',
  },

  /* Progress */
  progressTrack: {
    height: 3, backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg, borderRadius: 2,
    marginBottom: 20,
  },
  progressFill: { height: 3, backgroundColor: Colors.primary, borderRadius: 2 },

  /* CTA */
  ctaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl,
  },
  prevBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.primarySoft,
  },
  nextBtnWrap: {
    flex: 1,
    borderRadius: BorderRadius.pill,
    overflow: 'hidden',
    ...Shadows.brand,
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 18, paddingHorizontal: 20,
  },
  nextText: { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
  nextArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  // Faculty chip styles
  facChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 9,
    borderRadius: 999, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  facChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  facChipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  facChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
});

export default OnboardingScreen;
