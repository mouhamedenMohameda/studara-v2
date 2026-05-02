import React, { useRef, useState } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, BorderRadius, Shadows } from '../../theme';
import { useFaculties } from '../../hooks/useFaculties';
import { Faculty } from '../../types';
import { setFavoriteFaculty } from '../../utils/offlineStorage';

const { width } = Dimensions.get('window');

type SkeletonType =
  | 'homeKpi'
  | 'list'
  | 'organize'
  | 'flashFan'
  | 'campusStrip'
  | 'aiDual'
  | 'faculty';

type SlideDef = {
  key: string;
  step: string;
  emoji: string;
  accentColor: string;
  title: string;
  subtitle: string;
  bullets: string[];
  skeletonType: SkeletonType;
};

const SLIDES: SlideDef[] = [
  {
    key: 'hub',
    step: '01',
    emoji: '🏠',
    accentColor: Colors.primary,
    title: 'لوحة دراستك اليومية',
    subtitle:
      'تجمع الشاشة الرئيسية بين مؤشرات تقدّمك ومستوى تركيزك، وتتيح وصولًا سريعًا إلى بقية مزايا تطبيق «ستدارا».',
    bullets: [
      'متابعة سلسلة الأيام والهدف الدراسي اليومي',
      'مؤقّت بتقنية «بومودورو»، وتدوين وقت التركيز محليًا على جهازك',
      'شارات وبطاقات تعليمية، وتقرير نشاط موسمي مثل الخلاصة السنوية',
    ],
    skeletonType: 'homeKpi',
  },
  {
    key: 'resources',
    step: '02',
    emoji: '📚',
    accentColor: Colors.modules.resources,
    title: 'موارد دراسية ودروس مرئية',
    subtitle:
      'تصفّح آلاف الملخصات والامتحانات والتمارين، وشاهِد الدورات المرئية، وارفع المواد، وتابع حالة اعتماد ما رفعته.',
    bullets: [
      'تصفية النتائج بحسب الكلية والمقرّر، مع خيارات ترشيح مناسبة',
      'فتح الملفّات محليًا دون اتصال دائم، واستعراض ما عُرض مؤخرًا',
      'رفع الموارد ومتابعة مسار الموافقة عليها',
      'قسم دورات مرئية بمشغّل مدمج في التطبيق',
    ],
    skeletonType: 'list',
  },
  {
    key: 'organize',
    step: '03',
    emoji: '🗓️',
    accentColor: Colors.modules.timetable,
    title: 'الجدول الدراسي والتذكيرات',
    subtitle:
      'نظّم جدول محاضراتك أسبوعيًا، وأضف مواعيد الامتحانات والواجبات والمحاضرات، مع تنبيهات قبل الموعد.',
    bullets: [
      'جدول أسبوعي قابل للضبط، يعمل دون اتصال قدر الإمكان',
      'تذكيرات بفئات: امتحان، واجب، محاضرة، وفئة أخرى',
      'ربط بملخص نشاطك داخل التطبيق',
    ],
    skeletonType: 'organize',
  },
  {
    key: 'learn',
    step: '04',
    emoji: '🧠',
    accentColor: Colors.modules.flashcards,
    title: 'مراجعة بالبطاقات التعليمية',
    subtitle:
      'أنشئ مجموعات من البطاقات التعليمية، وراجعها في جلسات موقوتة، واستخدم الماسح الضوئي لتحويل صفحاتك إلى أسئلة بسرعة.',
    bullets: [
      'أنماط أسئلة متعدّدة مع جلسة مراجعة مبسّطة',
      'إنشاء مجموعة من صور أو من مستندات',
      'تذكيرات يومية لتشجيعك على الانتظام وتجنّب تأجيل المراجعة',
    ],
    skeletonType: 'flashFan',
  },
  {
    key: 'campus',
    step: '05',
    emoji: '🌍',
    accentColor: Colors.modules.jobs,
    title: 'عمل وفرص وسكن ومنتدى',
    subtitle:
      'استعرض عروض التدريب والتوظيف، والمنح والفرص الدراسية، وإعلانات سكن الطلاب، وتواصل مع الطلبة حول المواضيع الدراسية.',
    bullets: [
      'قوائم وظائف مع إمكان التقدّم إليها ومتابعة حالة الطلب',
      'أخبار وفرص مهنية ودراسية، بما فيها الفرص الخارجية عند عرضها',
      'إعلانات سكن وبحث عن غرف أو شقق',
      'منتدى طلابي للنقاش وتبادل الخبرات',
    ],
    skeletonType: 'campusStrip',
  },
  {
    key: 'ai',
    step: '06',
    emoji: '✨',
    accentColor: Colors.modules.news,
    title: 'أدوات الذكاء الاصطناعي',
    subtitle:
      'تلخيص المستندات والوثائق لتوفير الوقت، ومساعدة في بعض التمارين، بحسب اشتراكك والمزايا المفعّلة في حسابك.',
    bullets: [
      'تلخيص ملف بصيغة PDF مع إمكان حفظ سجل الأسئلة والأجوبة',
      'مسارات استيراد وخيارات للتمارين والتصحيح',
      'تخضع الخدمات لرصيد حسابك ولبنود اشتراكك أو العرض الحالي',
    ],
    skeletonType: 'aiDual',
  },
  {
    key: 'faculty',
    step: '07',
    emoji: '🎓',
    accentColor: Colors.primary,
    title: 'ما كليتك؟',
    subtitle:
      'نعرض لك أولًا ما يناسب تخصّصك، ويمكنك تعديل ذلك لاحقًا من صفحة ملفّك الشخصي.',
    bullets: ['اختيار كلية واحدة في هذه الخطوة لتجربة أولية تناسب تخصّصك'],
    skeletonType: 'faculty',
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

  const renderSkeleton = (s: SlideDef) => {
    switch (s.skeletonType) {
      case 'homeKpi':
        return (
          <>
            <View style={styles.homeKpiRow}>
              {[0.45, 0.35, 0.5].map((op, i) => (
                <View key={i} style={[styles.homeKpiBox, { borderColor: s.accentColor + '44', opacity: Math.max(op, 0.5) }]}>
                  <View style={[styles.mockupBar, { width: '60%', height: 6, backgroundColor: s.accentColor + '45' }]} />
                  <View style={[styles.mockupBar, { width: '40%', marginTop: 8, height: 14, backgroundColor: Colors.border }]} />
                </View>
              ))}
            </View>
            <View style={[styles.homeStreakBar, { backgroundColor: s.accentColor + '35' }]}>
              <View style={[styles.homeStreakFill, { width: '62%', backgroundColor: s.accentColor }]} />
            </View>
          </>
        );
      case 'list':
        return [
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
        ));
      case 'organize':
        return (
          <>
            <View style={styles.organizeMiniGrid}>
              {['١', '٢', '٣', '٤', '٥'].map((d, i) => (
                <View key={i} style={styles.organizeMiniCol}>
                  <Text style={[styles.organizeMiniLabel, { color: Colors.textMuted }]}>{d}</Text>
                  <View
                    style={[
                      styles.organizeMiniCell,
                      i === 1 && { backgroundColor: s.accentColor + '28', borderColor: s.accentColor },
                      i === 3 && { backgroundColor: Colors.modules.reminders + '22', borderColor: Colors.modules.reminders },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={{ gap: 6, marginTop: 4 }}>
              {[
                { c: Colors.error, lab: 'امتحان' },
                { c: Colors.primary, lab: 'واجب' },
              ].map((item, i) => (
                <View key={i} style={styles.mockupTimeline}>
                  <View style={[styles.mockupTimelineDot, { backgroundColor: item.c }]} />
                  <View style={[styles.mockupBar, { flex: 1, opacity: 0.75, backgroundColor: item.c + '44' }]} />
                  <View style={[styles.mockupBadgeRow, { backgroundColor: item.c + '22' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: item.c }}>{item.lab}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        );
      case 'flashFan':
        return (
          <View style={styles.flashFanWrap}>
            {[0.88, 0.76, 0.62].map((rw, i) => (
              <View
                key={i}
                style={[
                  styles.flashFanCard,
                  {
                    width: width * rw * 0.62,
                    backgroundColor: s.accentColor + (i === 0 ? '42' : i === 1 ? '2a' : '18'),
                    borderColor: s.accentColor + '88',
                    marginTop: i > 0 ? -10 : 0,
                  },
                ]}
              >
                <View style={[styles.mockupBar, { width: '70%', height: 7, backgroundColor: Colors.surface }]} />
                <View style={[styles.mockupBar, { width: '45%', marginTop: 10, height: 7, backgroundColor: Colors.border }]} />
              </View>
            ))}
          </View>
        );
      case 'campusStrip':
        return (
          <View style={styles.campusStrip}>
            {[
              { c: Colors.modules.jobs, t: 'وظائف' },
              { c: Colors.primary, t: 'فرص' },
              { c: Colors.modules.housing, t: 'سكن' },
              { c: '#0D9488', t: 'منتدى' },
            ].map((row, i) => (
              <View key={i} style={[styles.campusRow, { borderColor: row.c + '55', backgroundColor: row.c + '14' }]}>
                <View style={[styles.mockupTimelineDot, { backgroundColor: row.c }]} />
                <View style={[styles.mockupBar, { flex: 1, height: 9, opacity: 0.85, backgroundColor: row.c + '44' }]} />
                <Text style={[styles.campusRowTag, { color: row.c }]}>{row.t}</Text>
              </View>
            ))}
          </View>
        );
      case 'aiDual':
        return (
          <View style={{ gap: 10, paddingVertical: 4 }}>
            {[
              { emoji: '📄', tint: Colors.secondaryDark },
              { emoji: '✅', tint: Colors.modules.news },
            ].map((cell, i) => (
              <View key={i} style={[styles.aiDualRow, { borderColor: cell.tint + '40' }]}>
                <View style={[styles.aiDualIcon, { backgroundColor: cell.tint + '22' }]}>
                  <Text style={{ fontSize: 20 }}>{cell.emoji}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[styles.mockupBar, { width: '92%', height: 8, backgroundColor: Colors.border }]} />
                  <View style={[styles.mockupBar, { width: '55%', height: 7, opacity: 0.55, backgroundColor: Colors.border }]} />
                </View>
              </View>
            ))}
          </View>
        );
      case 'faculty':
        return (
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
        );
      default:
        return null;
    }
  };

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
              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={s.skeletonType !== 'faculty'}
                contentContainerStyle={styles.slideScrollContent}
                nestedScrollEnabled
              >
                <Text style={[styles.stepNum, { color: s.accentColor + '40' }]}>{s.step}</Text>

                <View style={[styles.mockup, { borderColor: s.accentColor + '30' }]}>
                  <View style={[styles.mockupHeader, { backgroundColor: s.accentColor + '18' }]}>
                    <Text style={{ fontSize: 20 }}>{s.emoji}</Text>
                    <View style={[styles.mockupBar, { width: 100, marginHorizontal: 8, backgroundColor: s.accentColor + '60' }]} />
                    <View style={{ flex: 1 }} />
                    <View style={[styles.mockupBadge, { backgroundColor: s.accentColor + '25' }]}>
                      <View style={[styles.mockupBar, { width: 28, backgroundColor: s.accentColor }]} />
                    </View>
                  </View>
                  {renderSkeleton(s)}
                </View>

                <View style={styles.textBlock}>
                  <Text style={styles.slideTitle}>{s.title}</Text>
                  <Text style={styles.slideSubtitle}>{s.subtitle}</Text>
                  {s.bullets.length > 0 && (
                    <View
                      style={[
                        styles.bulletsPanel,
                        {
                          backgroundColor: `${s.accentColor}0F`,
                          borderColor: `${s.accentColor}22`,
                        },
                      ]}
                    >
                      <View style={styles.bulletsPanelTop}>
                        <Text style={[styles.bulletsPanelHint, { color: s.accentColor }]}>أبرز المزايا</Text>
                        <View style={[styles.bulletsSpark, { backgroundColor: s.accentColor + '22' }]}>
                          <AppIcon name="sparkles" size={14} color={s.accentColor} />
                        </View>
                      </View>
                      {s.bullets.map((line, i) => (
                        <View
                          key={i}
                          style={[
                            styles.bulletCard,
                            { borderStartColor: s.accentColor },
                            Shadows.sm,
                          ]}
                        >
                          <View style={[styles.bulletBadge, { backgroundColor: s.accentColor + '1F' }]}>
                            <Text style={[styles.bulletBadgeText, { color: s.accentColor }]}>
                              {String(i + 1).padStart(2, '0')}
                            </Text>
                          </View>
                          <Text style={styles.bulletCardLine}>{line}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
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
              <AppIcon name="arrowBack" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.nextBtnWrap} onPress={handleNext} activeOpacity={0.88}>
            <View style={styles.nextBtn}>
              <Text style={styles.nextText}>
                {activeIndex === SLIDES.length - 1 ? 'ابدأ الآن 🚀' : 'التالي'}
              </Text>
              {activeIndex < SLIDES.length - 1 && (
                <View style={styles.nextArrow}>
                  <AppIcon name="arrowForward" size={18} color={Colors.primary} />
                </View>
              )}
            </View>
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
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', maxWidth: width * 0.52, justifyContent: 'center' },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: { width: 18, backgroundColor: Colors.primary, borderRadius: 3 },
  dotDone: { backgroundColor: Colors.primaryLight },

  slide: {
    paddingHorizontal: Spacing.lg,
    flex: 1,
  },
  slideScrollContent: {
    paddingTop: 0,
    paddingBottom: Spacing.md,
    flexGrow: 1,
  },

  stepNum: {
    fontSize: 64, fontWeight: '900', letterSpacing: -4,
    alignSelf: 'flex-start',
    marginBottom: -6,
    lineHeight: 68,
  },

  mockup: {
    width: '100%', borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: Colors.background,
    padding: 14, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    marginBottom: 20,
  },
  mockupHeader: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, padding: 10,
  },
  mockupBar:   { height: 8, borderRadius: 4 },
  mockupBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  mockupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6, paddingHorizontal: 4,
  },
  mockupIcon: { width: 36, height: 36, borderRadius: 10 },
  mockupTimeline: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 4, paddingVertical: 5,
  },
  mockupTimelineDot: { width: 12, height: 12, borderRadius: 6 },
  mockupBadgeRow: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },

  homeKpiRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 2,
  },
  homeKpiBox: {
    flex: 1, minHeight: 56, borderRadius: 14, borderWidth: 1,
    padding: 10, justifyContent: 'center',
    backgroundColor: Colors.surfaceWarm,
  },
  homeStreakBar: {
    height: 10, borderRadius: 5, marginTop: 10, overflow: 'hidden',
  },
  homeStreakFill: { height: '100%', borderRadius: 5 },

  organizeMiniGrid: { flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 2 },
  organizeMiniCol: { flex: 1, alignItems: 'center', gap: 4 },
  organizeMiniLabel: { fontSize: 9, fontWeight: '700' },
  organizeMiniCell: {
    width: '100%', height: 26, borderRadius: 6,
    backgroundColor: Colors.surfaceWarm,
    borderWidth: 1, borderColor: Colors.border,
  },

  flashFanWrap: {
    alignItems: 'flex-end',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 0,
  },
  flashFanCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginRight: 8,
  },

  campusStrip: { gap: 8, paddingVertical: 4 },
  campusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  campusRowTag: { fontSize: 11, fontWeight: '900', minWidth: 44, textAlign: 'left' },

  aiDualRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    backgroundColor: Colors.surfaceWarm,
  },
  aiDualIcon: {
    width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },

  textBlock: { gap: 8, paddingHorizontal: 4 },
  slideTitle: {
    fontSize: 26, fontWeight: '900', color: Colors.textPrimary,
    textAlign: 'right', letterSpacing: -0.6, lineHeight: 34,
  },
  slideSubtitle: {
    fontSize: 14, color: Colors.textSecondary,
    textAlign: 'right', lineHeight: 21, fontWeight: '500',
  },
  bulletsPanel: {
    marginTop: 10,
    padding: 12,
    paddingTop: 10,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: 8,
  },
  bulletsPanelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  bulletsSpark: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletsPanelHint: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  bulletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    paddingStart: 11,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderStartWidth: 3,
  },
  bulletBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  bulletCardLine: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 20,
  },

  progressTrack: {
    height: 3, backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg, borderRadius: 2,
    marginBottom: 20,
  },
  progressFill: { height: 3, backgroundColor: Colors.primary, borderRadius: 2 },

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
    backgroundColor: Colors.primary,
  },
  nextText: { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
  nextArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },

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
