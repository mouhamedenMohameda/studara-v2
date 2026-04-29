import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SectionList, Share, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ResourcesStackParamList, ResourceType, Faculty, Resource, ResourceStatus, University } from '../../types';
import { Colors, Spacing, BorderRadius, Shadows } from '../../theme';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import { apiRequest } from '../../utils/api';
import { useQuery } from '@tanstack/react-query';
import {
  cacheResourcesList, getCachedResourcesList, timeAgoAr,
} from '../../utils/offlineStorage';
import { OfflineBanner } from '../../components/common/OfflineBanner';
import { normalizeCurriculumFacultySlug } from '../../utils/normalizeCurriculumFaculty';
import { safeBack } from '../../utils/safeBack';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';

type Nav = StackNavigationProp<ResourcesStackParamList, 'ResourcesList'>;

// ─── Static mappings ──────────────────────────────────────────────────────────

const TYPE_ICONS: Record<ResourceType, AppIconName> = {
  [ResourceType.Note]:         'documentText',
  [ResourceType.PastExam]:     'clipboard',
  [ResourceType.Summary]:      'reader',
  [ResourceType.Exercise]:     'pencil',
  [ResourceType.Project]:      'rocket',
  [ResourceType.Presentation]: 'easel',
  [ResourceType.VideoCourse]:  'playCircle',
};

const TYPE_COLORS: Record<ResourceType, string> = {
  [ResourceType.Note]:         '#8B5CF6',
  [ResourceType.PastExam]:     '#EF4444',
  [ResourceType.Summary]:      '#10B981',
  [ResourceType.Exercise]:     '#F59E0B',
  [ResourceType.Project]:      '#3B82F6',
  [ResourceType.Presentation]: '#EC4899',
  [ResourceType.VideoCourse]:  '#FF6B35',
};

// Gradient pairs for year pills (one per year, cycling — vibrant Gen-Z)
const YEAR_GRADIENTS: [string, string][] = [
  ['#8B5CF6', '#EC4899'], // violet → pink
  ['#0EA5E9', '#6366F1'], // sky → indigo
  ['#10B981', '#059669'], // emerald
  ['#F59E0B', '#EF4444'], // amber → red
  ['#EC4899', '#F43F5E'], // pink → rose
  ['#7C3AED', '#A78BFA'], // violet mono
  ['#14B8A6', '#0EA5E9'], // teal → sky
];

const mapResource = (r: any): Resource => ({
  id: r.id,
  title: r.title,
  titleAr: r.title_ar,
  subject: r.subject,
  type: r.resource_type as ResourceType,
  faculty: r.faculty as Faculty,
  university: (r.university || 'una') as University,
  year: r.year,
  semester: r.semester,
  fileUrl: r.file_url,
  fileName: r.file_name,
  fileSize: r.file_size,
  fileType: r.file_type,
  uploadedBy: {
    id: r.uploader_id,
    fullName: r.uploader_name || 'Anonyme',
    faculty: r.faculty as Faculty,
  },
  status: ResourceStatus.Approved,
  downloads: r.downloads || 0,
  likes: r.likes || 0,
  tags: r.tags || [],
  createdAt: r.created_at,
  updatedAt: r.created_at,
  moderatedAt: r.moderated_at ?? r.created_at,
});

// ─── Section type ─────────────────────────────────────────────────────────────

type SubjectSection = { subject: string; data: Resource[] };

// ─── Styles factory ─────────────────────────────────────────────────────────

const makeStyles = (C: typeof Colors, fs: (n: number) => number = n => n) => StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.background },
  // Header
  headerWrap:       { paddingBottom: 0, backgroundColor: C.background },
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  headerTitle:      { fontSize: fs(28), fontWeight: '900', color: C.textPrimary, letterSpacing: -1 },
  headerSubtitle:   { fontSize: fs(12), color: C.textSecondary, marginTop: 3, fontWeight: '600' },
  backBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.surface,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    ...Shadows.xs,
  },
  uploadBtn:        {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    ...Shadows.brand,
  },
  // Search
  searchWrap:       { marginHorizontal: 16, marginBottom: 10 },
  searchBox:        {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 18,
    paddingHorizontal: 16, paddingVertical: 13, gap: 10,
    borderWidth: 1.5, borderColor: C.border,
    ...Shadows.xs,
  },
  searchInput:      { flex: 1, fontSize: fs(14), color: C.textPrimary, fontWeight: '500' },
  // Filter rows (named segments)
  filterLabel:      { fontSize: fs(10), fontWeight: '800', color: C.textMuted, letterSpacing: 1.4, textTransform: 'uppercase', paddingLeft: 20, paddingBottom: 2, paddingTop: 12 },
  filterSeparator:  { height: 1, backgroundColor: C.borderLight, marginTop: 2 },
  // Year pills (large, gradient bg when active)
  yearPill:         { minWidth: 56, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden' },
  yearPillActive:   { borderColor: 'transparent', ...Shadows.brand },
  yearPillText:     { fontSize: fs(14), fontWeight: '800', color: C.textSecondary },
  yearPillTextAct:  { color: '#fff', fontWeight: '900' },
  // Subject pills
  subjectPill:      { height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  subjectPillAct:   { backgroundColor: C.primary, borderColor: C.primary, ...Shadows.brand },
  subjectPillText:  { fontSize: fs(13), fontWeight: '700', color: C.textSecondary },
  subjectPillTextA: { color: '#fff', fontWeight: '800' },
  subjectAllPill:   { borderColor: C.primarySoft, backgroundColor: C.primarySurface },
  subjectAllAct:    { backgroundColor: C.primary, borderColor: C.primary },
  // Type pills (with icon + color)
  typePill:         { height: 36, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, gap: 6, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  typePillText:     { fontSize: fs(12), fontWeight: '700', color: C.textSecondary },
  typePillTextAct:  { fontWeight: '800', color: '#fff' },
  // Active filter tags (summary row)
  activeFilters:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6 },
  filterTag:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: C.primarySurface, borderWidth: 1, borderColor: C.primarySoft },
  filterTagTxt:     { fontSize: fs(11), fontWeight: '800', color: C.primary },
  // Section headers
  sectionHdr:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.background, paddingTop: 22, paddingBottom: 10 },
  sectionBar:       { width: 5, height: 22, borderRadius: 3, backgroundColor: C.primary },
  sectionName:      { flex: 1, fontSize: fs(15), fontWeight: '900', color: C.textPrimary, letterSpacing: -0.3 },
  sectionBadge:     { backgroundColor: C.primarySurface, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: C.primarySoft },
  sectionBadgeTxt:  { fontSize: fs(11), fontWeight: '800', color: C.primary },
  totalCount:       { fontSize: fs(11), color: C.textMuted, textAlign: 'center', paddingVertical: 8, fontWeight: '600' },
  // Cards
  card:             {
    backgroundColor: C.surface, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
    borderWidth: 1, borderColor: C.borderLight,
    ...Shadows.xs,
  },
  cardIconWrap:     { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardContent:      { flex: 1 },
  cardRight:        { alignItems: 'center', gap: 10 },
  cardTitle:        { fontSize: fs(14), fontWeight: '800', color: C.textPrimary, textAlign: 'right', lineHeight: 20 },
  cardSubject:      { textAlign: 'right', marginTop: 3, fontSize: fs(12), fontWeight: '700' },
  cardMeta:         { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' },
  badge:            { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  badgeText:        { fontSize: fs(10), fontWeight: '800' },
  newBadge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: C.primarySurface },
  newBadgeTxt:      { fontSize: fs(10), fontWeight: '800', color: C.primary },
  yearTag:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: C.primarySurface },
  yearTagTxt:       { fontSize: fs(10), fontWeight: '800', color: C.primary },
  statRow:          { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statTxt:          { fontSize: fs(11), color: C.textSecondary, fontWeight: '600' },
  // Skeleton
  skeletonCard:     { backgroundColor: C.surface, borderRadius: 20, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, marginBottom: 10, borderWidth: 1, borderColor: C.borderLight },
  skeletonIcon:     { width: 54, height: 54, borderRadius: 16, backgroundColor: C.border, flexShrink: 0 },
  skeletonContent:  { flex: 1 },
  skeletonLine:     { height: 13, borderRadius: 7, backgroundColor: C.border },
  // Load more
  loadMoreBtn:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginHorizontal: 36, marginBottom: 8, borderRadius: 18, backgroundColor: C.primarySurface, borderWidth: 1, borderColor: C.primarySoft },
  loadMoreTxt:      { fontSize: fs(13), fontWeight: '800', color: C.primary },
  // Empty
  empty:            { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40, paddingTop: 60 },
  emptyTitle:       { fontSize: fs(20), fontWeight: '900', color: C.textPrimary, textAlign: 'center', letterSpacing: -0.4 },
  emptyBody:        { fontSize: fs(13), color: C.textSecondary, textAlign: 'center', lineHeight: 20, fontWeight: '500' },
  uploadCTA:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, paddingHorizontal: 26, paddingVertical: 14, borderRadius: 999, marginTop: 4, ...Shadows.brand },
});

// ─── Skeleton Card ───────────────────────────────────────────────────────────

const SkeletonCard = () => {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.9, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
    ])).start();
  }, [pulse]);
  return (
    <Animated.View style={[styles.skeletonCard, { opacity: pulse }]}>
      <View style={styles.skeletonIcon} />
      <View style={styles.skeletonContent}>
        <View style={[styles.skeletonLine, { width: '80%' }]} />
        <View style={[styles.skeletonLine, { width: '50%', marginTop: 7 }]} />
        <View style={[styles.skeletonLine, { width: '30%', height: 20, borderRadius: 10, marginTop: 9 }]} />
      </View>
    </Animated.View>
  );
};

const LIMIT = 30;

// ─── Year Pill (animated bounce + gradient) ───────────────────────────────────

const YearPill = ({
  year, active, onPress, isAr,
}: { year: number; active: boolean; onPress: () => void; isAr: boolean }) => {
  const { colors: C } = useTheme();
  const { fontSize } = useAccessibility();
  const styles = useMemo(() => makeStyles(C, fontSize), [C, fontSize]);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.87, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 14 }),
    ]).start();
    onPress();
  };

  const [g1, g2] = YEAR_GRADIENTS[(year - 1) % YEAR_GRADIENTS.length];
  const label = isAr ? `س${year}` : `A${year}`;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={[styles.yearPill, active && styles.yearPillActive]}
      >
        {active && (
          <LinearGradient
            colors={[g1, g2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <Text style={[styles.yearPillText, active && styles.yearPillTextAct]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Filter Section Row ───────────────────────────────────────────────────────

const FilterRow = ({
  label, children,
}: { label: string; children: React.ReactNode }) => {
  const { colors: C } = useTheme();
  const { fontSize } = useAccessibility();
  const styles = useMemo(() => makeStyles(C, fontSize), [C, fontSize]);
  return (
    <View>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, paddingTop: 4, gap: 8, alignItems: 'center' }}
      >
        {children}
      </ScrollView>
      <View style={styles.filterSeparator} />
    </View>
  );
};

// ─── Resource Card ────────────────────────────────────────────────────────────

const ResourceCard = React.memo(({
  resource, onPress, onShare, typeLabels, isAr, showYear,
}: {
  resource: Resource;
  onPress: () => void;
  onShare: () => void;
  typeLabels: Record<ResourceType, string>;
  isAr: boolean;
  showYear?: boolean;
}) => {
  const { colors: C } = useTheme();
  const { fontSize } = useAccessibility();
  const styles = useMemo(() => makeStyles(C, fontSize), [C, fontSize]);
  const color = TYPE_COLORS[resource.type] || '#8B5CF6';
  const isNew = resource.moderatedAt
    ? Date.now() - new Date(resource.moderatedAt).getTime() < 48 * 60 * 60 * 1000
    : false;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.cardIconWrap, { backgroundColor: color + '18' }]}>
        <AppIcon name={TYPE_ICONS[resource.type] || 'documentOutline'} size={23} color={color} />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {resource.titleAr || resource.title}
        </Text>
        {resource.subject ? (
          <Text style={[styles.cardSubject, { color }]} numberOfLines={1}>
            {resource.subject}
          </Text>
        ) : null}
        <View style={styles.cardMeta}>
          <View style={[styles.badge, { backgroundColor: color + '18' }]}>
            <Text style={[styles.badgeText, { color }]}>{typeLabels[resource.type]}</Text>
          </View>
          {showYear && resource.year ? (
            <View style={styles.yearTag}>
              <Text style={styles.yearTagTxt}>{isAr ? `س${resource.year}` : `A${resource.year}`}</Text>
            </View>
          ) : null}
          {isNew && (
            <View style={styles.newBadge}><Text style={styles.newBadgeTxt}>✨ جديد</Text></View>
          )}
          {resource.downloads > 0 && (
            <View style={styles.statRow}>
              <AppIcon name="downloadOutline" size={11} color={C.textMuted} />
              <Text style={styles.statTxt}>{resource.downloads}</Text>
            </View>
          )}
          {resource.likes > 0 && (
            <View style={styles.statRow}>
              <AppIcon name="heartOutline" size={11} color="#EC4899" />
              <Text style={styles.statTxt}>{resource.likes}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.cardRight}>
        <TouchableOpacity
          onPress={e => { e.stopPropagation?.(); onShare(); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <AppIcon name="shareOutline" size={17} color={C.textMuted} />
        </TouchableOpacity>
        <AppIcon name={isAr ? 'chevronBack' : 'chevronForward'} size={16} color={C.textMuted} />
      </View>
    </TouchableOpacity>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

const ResourcesScreen = () => {
  const { colors: C } = useTheme();
  const { fontSize } = useAccessibility();
  const styles = useMemo(() => makeStyles(C, fontSize), [C, fontSize]);
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const isAr = lang === 'ar';

  const goHomeTab = useCallback(() => {
    smoothGoHomeTab(navigation as any);
  }, [navigation]);

  const onBackPress = useCallback(() => {
    if ((navigation as any)?.canGoBack?.()) {
      (navigation as any).goBack?.();
      return;
    }
    goHomeTab();
  }, [navigation, goHomeTab]);

  const TYPE_LABELS = useMemo<Record<ResourceType, string>>(() => ({
    [ResourceType.Note]:         t('res.type.note'),
    [ResourceType.PastExam]:     t('res.type.past_exam'),
    [ResourceType.Summary]:      t('res.type.summary'),
    [ResourceType.Exercise]:     t('res.type.exercise'),
    [ResourceType.Project]:      t('res.type.project'),
    [ResourceType.Presentation]: t('res.type.presentation'),
    [ResourceType.VideoCourse]:  t('res.type.video'),
  }), [t]);

  // ── Filters ──
  const activeFaculty = useMemo(() => {
    // Users may have academic-structure slugs (ex: una-fm). Resources/subjects use curriculum buckets.
    return normalizeCurriculumFacultySlug(user?.faculty ?? null, (user as any)?.filiere ?? null);
  }, [user]);
  const [selectedYear,    setSelectedYear]          = useState<number | null>(null);
  const [selectedSubject, setSelectedSubject]       = useState<string | null>(null);
  const [selectedType,    setSelectedType]          = useState<ResourceType | null>(null);
  const [search,          setSearch]                = useState('');
  const [debouncedSearch, setDebouncedSearch]       = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset subject when year changes
  useEffect(() => { setSelectedSubject(null); }, [selectedYear]);

  // ── Distinct subjects (driven by selected year) ──
  const { data: subjectOptions = [] } = useQuery<string[]>({
    queryKey: ['distinct-subjects', activeFaculty, selectedYear],
    queryFn: () => {
      const p = new URLSearchParams();
      if (activeFaculty)         p.set('faculty', activeFaculty);
      if (selectedYear !== null) p.set('year', String(selectedYear));
      return apiRequest<string[]>('/resources/distinct-subjects?' + p.toString());
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Data fetch ──
  const [offlineCachedAt, setOfflineCachedAt] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['resources', 'v2', activeFaculty, selectedYear, selectedSubject, selectedType, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (activeFaculty)          params.set('faculty', activeFaculty);
      if (selectedYear !== null)  params.set('year', String(selectedYear));
      if (selectedSubject)        params.set('subject', selectedSubject);
      if (selectedType)           params.set('type', selectedType);
      const cacheKey = params.toString() || 'default';
      try {
        const result = await apiRequest<{ data: unknown[]; total: number }>('/resources?' + params.toString());
        cacheResourcesList(cacheKey, result);
        setOfflineCachedAt(null);
        return result;
      } catch {
        const cached = await getCachedResourcesList(cacheKey);
        if (cached) { setOfflineCachedAt(cached.cachedAt); return { data: cached.data, total: cached.total }; }
        throw new Error('offline_no_cache');
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const baseResources = useMemo(() => (data?.data ?? []).map(mapResource), [data]);
  const total         = data?.total ?? 0;

  // ── Pagination ──
  const [extraPages,    setExtraPages]    = useState<Resource[][]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => { setExtraPages([]); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedYear, selectedSubject, selectedType, debouncedSearch]);

  const allResources = useMemo(() => [...baseResources, ...extraPages.flat()], [baseResources, extraPages]);
  const hasMore      = allResources.length < total;

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = Math.ceil(allResources.length / LIMIT) + 1;
      const params   = new URLSearchParams({ limit: String(LIMIT), page: String(nextPage) });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (activeFaculty)          params.set('faculty', activeFaculty);
      if (selectedYear !== null)  params.set('year', String(selectedYear));
      if (selectedSubject)        params.set('subject', selectedSubject);
      if (selectedType)           params.set('type', selectedType);
      const result = await apiRequest<{ data: unknown[]; total: number }>('/resources?' + params.toString());
      setExtraPages(prev => [...prev, result.data.map(mapResource)]);
    } catch { /* ignore */ } finally { setIsLoadingMore(false); }
  }, [isLoadingMore, hasMore, allResources.length, debouncedSearch, activeFaculty, selectedYear, selectedSubject, selectedType]);

  // ── Group by subject ──
  const sections: SubjectSection[] = useMemo(() => {
    const map = new Map<string, Resource[]>();
    allResources.forEach(r => {
      const key = r.subject || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries())
      .map(([subject, data]) => ({ subject, data }))
      .sort((a, b) => b.data.length - a.data.length);
  }, [allResources]);

  const handleSearch = (text: string) => {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 450);
  };

  const handleNavigate = (item: Resource) => {
    if (item.type === ResourceType.VideoCourse) {
      navigation.navigate('CourseViewer', { title: item.titleAr || item.title, url: item.fileUrl || '', subject: item.subject });
    } else {
      navigation.navigate('ResourceDetail', { resource: item });
    }
  };

  const handleShare = useCallback((item: Resource) => {
    const title = item.titleAr || item.title;
    Share.share({ title, message: `📚 ${title}\n📖 ${item.subject} — السنة ${item.year}\n\n🎓 Studara — التطبيق الأول للطلاب الموريتانيين` });
  }, []);

  const activeFilterCount = [selectedYear, selectedSubject, selectedType].filter(Boolean).length;

  return (
    <View style={styles.container}>

      {/* ── HEADER ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
        <View style={styles.headerWrap}>

          {/* Title + Upload button */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onBackPress}
              activeOpacity={0.75}
            >
              <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={20} color={C.textPrimary} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>{isAr ? '📚 المكتبة' : '📚 Bibliothèque'}</Text>
              <Text style={styles.headerSubtitle}>
                {total > 0
                  ? `${total.toLocaleString()} ${isAr ? 'ملف متاح' : 'fichiers disponibles'}`
                  : isAr ? 'ابحث عن ملفاتك' : 'Parcourez vos cours'}
              </Text>
            </View>
            <TouchableOpacity style={styles.uploadBtn} onPress={() => navigation.navigate('UploadResource')} activeOpacity={0.8}>
              <AppIcon name="cloudUploadOutline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={styles.searchWrap}>
            <View style={styles.searchBox}>
              <AppIcon name="searchOutline" size={17} color={C.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={isAr ? 'ابحث عن مادة أو ملف...' : 'Rechercher...'}
                placeholderTextColor={C.textMuted}
                value={search}
                onChangeText={handleSearch}
                textAlign={isAr ? 'right' : 'left'}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')}>
                  <AppIcon name="closeCircle" size={17} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── ROW 1 — YEAR ── */}
          <FilterRow label={isAr ? 'السنة' : 'ANNÉE'}>
            {/* "All" pill */}
            <TouchableOpacity
              style={[styles.yearPill, selectedYear === null && styles.yearPillActive, { overflow: 'hidden' }]}
              onPress={() => setSelectedYear(null)}
              activeOpacity={0.8}
            >
              {selectedYear === null && (
                <LinearGradient
                  colors={['#8B5CF6', '#EC4899', '#F97316']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Text style={[styles.yearPillText, selectedYear === null && styles.yearPillTextAct]}>
                {isAr ? 'الكل' : 'Tout'}
              </Text>
            </TouchableOpacity>
            {[1, 2, 3, 4, 5, 6, 7].map(y => (
              <YearPill
                key={y}
                year={y}
                active={selectedYear === y}
                onPress={() => setSelectedYear(prev => prev === y ? null : y)}
                isAr={isAr}
              />
            ))}
          </FilterRow>

          {/* ── ROW 2 — SUBJECT ── */}
          <FilterRow label={isAr ? 'المادة' : 'MATIÈRE'}>
            <TouchableOpacity
              style={[styles.subjectPill, styles.subjectAllPill, selectedSubject === null && styles.subjectAllAct]}
              onPress={() => setSelectedSubject(null)}
            >
              <Text style={[styles.subjectPillText, selectedSubject === null && styles.subjectPillTextA]}>
                {isAr ? '✦ الكل' : '✦ Tout'}
              </Text>
            </TouchableOpacity>
            {subjectOptions.length === 0 ? (
              <Text style={{ fontSize: fontSize(12), color: C.textMuted, alignSelf: 'center', paddingLeft: 4 }}>
                {isAr ? '← اختر سنة لعرض المواد' : '← Sélectionne une année'}
              </Text>
            ) : null}
            {subjectOptions.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.subjectPill, selectedSubject === s && styles.subjectPillAct]}
                onPress={() => setSelectedSubject(prev => prev === s ? null : s)}
              >
                <Text style={[styles.subjectPillText, selectedSubject === s && styles.subjectPillTextA]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </FilterRow>

          {/* ── ROW 3 — DOCUMENT TYPE ── */}
          <FilterRow label={isAr ? 'نوع الملف' : 'TYPE DE DOCUMENT'}>
            {/* "All types" pill */}
            <TouchableOpacity
              style={[styles.typePill, selectedType === null && { backgroundColor: C.primary, borderColor: C.primary }]}
              onPress={() => setSelectedType(null)}
            >
              <AppIcon name="albumsOutline" size={14} color={selectedType === null ? '#fff' : C.textSecondary} />
              <Text style={[styles.typePillText, selectedType === null && styles.typePillTextAct]}>
                {isAr ? 'الكل' : 'Tout'}
              </Text>
            </TouchableOpacity>
            {(Object.values(ResourceType) as ResourceType[]).map(rt => {
              const col   = TYPE_COLORS[rt];
              const isAct = selectedType === rt;
              return (
                <TouchableOpacity
                  key={rt}
                  style={[styles.typePill, isAct && { backgroundColor: col, borderColor: col, ...Shadows.sm }]}
                  onPress={() => setSelectedType(prev => prev === rt ? null : rt)}
                >
                  <AppIcon name={TYPE_ICONS[rt]} size={13} color={isAct ? '#fff' : col} />
                  <Text style={[styles.typePillText, isAct ? styles.typePillTextAct : { color: col }]}>
                    {TYPE_LABELS[rt]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </FilterRow>

          {/* Active filter summary (tap to clear) */}
          {activeFilterCount > 0 && (
            <View style={styles.activeFilters}>
              {selectedYear !== null && (
                <TouchableOpacity style={styles.filterTag} onPress={() => setSelectedYear(null)}>
                  <Text style={styles.filterTagTxt}>{isAr ? `س${selectedYear}` : `A${selectedYear}`}</Text>
                  <AppIcon name='close' size={12} color={C.primary} />
                </TouchableOpacity>
              )}
              {selectedSubject !== null && (
                <TouchableOpacity style={styles.filterTag} onPress={() => setSelectedSubject(null)}>
                  <Text style={styles.filterTagTxt} numberOfLines={1}>{selectedSubject}</Text>
                  <AppIcon name='close' size={12} color={C.primary} />
                </TouchableOpacity>
              )}
              {selectedType !== null && (
                <TouchableOpacity style={styles.filterTag} onPress={() => setSelectedType(null)}>
                  <Text style={styles.filterTagTxt}>{TYPE_LABELS[selectedType]}</Text>
                  <AppIcon name='close' size={12} color={C.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => { setSelectedYear(null); setSelectedSubject(null); setSelectedType(null); }}
              >
                <Text style={{ fontSize: fontSize(11), color: '#EF4444', fontWeight: '700', paddingTop: 4 }}>
                  {isAr ? 'مسح الكل ✕' : 'Tout effacer ✕'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </SafeAreaView>

      {/* Offline banner */}
      {offlineCachedAt !== null && (
        <OfflineBanner message={`قائمة محفوظة — ${timeAgoAr(offlineCachedAt)} (التحميل يتطلب اتصالاً)`} />
      )}

      {/* ── CONTENT ── */}
      {isLoading ? (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14, gap: 8 }}>
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : isError ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 }}>
          <AppIcon name="cloudOfflineOutline" size={60} color={C.textMuted} />
          <Text style={{ fontSize: fontSize(16), fontWeight: '700', color: C.textPrimary }}>
            {isAr ? 'تعذّر الاتصال' : 'Connexion impossible'}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 26 }}
            onPress={() => refetch()}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? 'إعادة المحاولة' : 'Réessayer'}</Text>
          </TouchableOpacity>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 52 }}>📂</Text>
          <Text style={styles.emptyTitle}>{isAr ? 'لا توجد ملفات' : 'Aucun fichier'}</Text>
          <Text style={styles.emptyBody}>
            {isAr
              ? 'لا توجد ملفات تطابق هذه الفلاتر. جرّب تغيير السنة أو المادة.'
              : "Aucun fichier ne correspond à ces filtres. Essaie de changer l'année ou la matière."}
          </Text>
          <TouchableOpacity style={styles.uploadCTA} onPress={() => navigation.navigate('UploadResource')}>
            <AppIcon name="cloudUploadOutline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize(13) }}>
              {isAr ? 'ارفع أول ملف' : 'Ajouter un fichier'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHdr, { paddingHorizontal: 16 }]}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionName}>{section.subject}</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeTxt}>{section.data.length}</Text>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 16 }}>
              <ResourceCard
                resource={item}
                typeLabels={TYPE_LABELS}
                isAr={isAr}
                showYear={selectedYear === null}
                onPress={() => handleNavigate(item)}
                onShare={() => handleShare(item)}
              />
            </View>
          )}
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={() =>
            total > 0 ? (
              <Text style={styles.totalCount}>
                {allResources.length} / {total.toLocaleString()} {isAr ? 'ملف' : 'fichiers'}
              </Text>
            ) : null
          }
          ListFooterComponent={() =>
            hasMore ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={loadMore}
                disabled={isLoadingMore}
                activeOpacity={0.7}
              >
                {isLoadingMore
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : <Text style={styles.loadMoreTxt}>{isAr ? '↓ تحميل المزيد' : '↓ Charger plus'}</Text>}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
};

export default ResourcesScreen;