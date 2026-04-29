import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CoursesStackParamList } from '../../types';
import { Colors, Spacing, BorderRadius, Shadows } from '../../theme';
import { useLanguage } from '../../context/LanguageContext';
import { safeBack } from '../../utils/safeBack';

type Nav = StackNavigationProp<CoursesStackParamList, 'CoursesList'>;

import { apiRequest } from '../../utils/api';

interface VideoCourse {
  id: string;
  title: string;
  subject: string;
  file_url: string;
  downloads: number;
  tags: string[];
}

const CATEGORIES: { label: string; labelAr: string; value: string | null; icon: string }[] = [
  { label: 'All',              labelAr: 'الكل',              value: null,                                      icon: '🎓' },
  { label: 'Maths',            labelAr: 'رياضيات',           value: 'Mathématiques pour Informaticiens',       icon: '📐' },
  { label: 'Machine Learning', labelAr: 'تعلم الآلة',        value: 'Introduction au Machine Learning',        icon: '🤖' },
  { label: 'Algorithms',       labelAr: 'خوارزميات',         value: 'Structures de Données et Algorithmes',    icon: '🧮' },
  { label: 'Intro CS',         labelAr: 'مقدمة',             value: 'Informatique Générale',                   icon: '💻' },
  { label: 'Robotics',         labelAr: 'روبوتيكا',          value: 'Robotique et Contrôle',                   icon: '🦾' },
  { label: 'Programming',      labelAr: 'لغات برمجة',        value: 'Langages de Programmation',               icon: '🔤' },
  { label: 'Computer Vision',  labelAr: 'رؤية حاسوب',        value: 'Vision par Ordinateur',                   icon: '👁️' },
  { label: 'Deep Learning',    labelAr: 'تعلم عميق',         value: 'Apprentissage Profond',                   icon: '🧠' },
  { label: 'Architecture',     labelAr: 'معمارية حاسوب',     value: 'Organisation des Ordinateurs',            icon: '🏗️' },
  { label: 'Security',         labelAr: 'أمن معلومات',       value: 'Sécurité Informatique',                   icon: '🔒' },
  { label: 'Basics',           labelAr: 'أساسيات',           value: "Introduction à l'Informatique",           icon: '🖥️' },
  { label: 'Reinforcement',    labelAr: 'تعلم تعزيزي',       value: 'Apprentissage par Renforcement',          icon: '🎮' },
  { label: 'Generative AI',    labelAr: 'ذكاء توليدي',       value: 'IA Générative et LLMs',                   icon: '🪄' },
  { label: 'Networks',         labelAr: 'شبكات',             value: 'Réseaux Informatiques',                   icon: '🌐' },
  { label: 'Quantum',          labelAr: 'حوسبة كمومية',      value: 'Informatique Quantique',                  icon: '⚛️' },
  { label: 'AI',               labelAr: 'ذكاء اصطناعي',     value: 'Intelligence Artificielle',               icon: '✨' },
  { label: 'NLP',              labelAr: 'معالجة لغة',        value: 'Traitement du Langage Naturel',           icon: '💬' },
  { label: 'Embedded',         labelAr: 'أنظمة مدمجة',       value: 'Systèmes Embarqués',                      icon: '🔧' },
  { label: 'Optimisation',     labelAr: 'تحسين',             value: 'Optimisation',                            icon: '📈' },
  { label: 'Databases',        labelAr: 'قواعد بيانات',      value: 'Bases de Données',                        icon: '🗄️' },
  { label: 'Distributed',      labelAr: 'أنظمة موزعة',       value: 'Systèmes Distribués',                     icon: '☁️' },
  { label: 'OS',               labelAr: 'أنظمة تشغيل',       value: "Systèmes d'Exploitation",                 icon: '⚙️' },
];

const isYouTube = (url: string) =>
  url.includes('youtube.com') || url.includes('youtu.be');

const getDomain = (url: string): string => {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    if (host.includes('youtube')) return 'YouTube';
    if (host.includes('ocw.mit')) return 'MIT OCW';
    if (host.includes('coursera')) return 'Coursera';
    if (host.includes('stanford')) return 'Stanford';
    if (host.includes('nptel')) return 'NPTEL';
    if (host.includes('berkeley')) return 'UC Berkeley';
    if (host.includes('cmu')) return 'CMU';
    return host.split('.').slice(-2, -1)[0] || host;
  } catch {
    return 'Lien';
  }
};

const CourseCard = ({ course, onPress }: { course: VideoCourse; onPress: () => void }) => {
  const yt = isYouTube(course.file_url);
  const domain = getDomain(course.file_url);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.cardIcon, yt ? styles.cardIconYT : styles.cardIconWeb]}>
        <AppIcon
          name={yt ? 'logoYoutube' : 'playCircle'}
          size={24}
          color={yt ? '#FF0000' : '#6366F1'}
        />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={2}>{course.title}</Text>
        <Text style={styles.cardSubject} numberOfLines={1}>{course.subject}</Text>
        <View style={styles.cardMeta}>
          <View style={[styles.domainBadge, yt ? styles.domainBadgeYT : styles.domainBadgeWeb]}>
            <AppIcon name={yt ? 'logoYoutube' : 'openOutline'} size={10} color={yt ? '#FF0000' : '#6366F1'} />
            <Text style={[styles.domainText, yt ? styles.domainTextYT : styles.domainTextWeb]}>{domain}</Text>
          </View>
          {course.downloads > 0 && (
            <View style={styles.viewChip}>
              <AppIcon name="eyeOutline" size={11} color={Colors.textSecondary} />
              <Text style={styles.viewText}>{course.downloads}</Text>
            </View>
          )}
        </View>
      </View>
      <AppIcon name="openOutline" size={16} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
};

const VideoCoursesScreen = () => {
  const navigation = useNavigation<Nav>();
  const { t, lang } = useLanguage();
  const [courses, setCourses] = useState<VideoCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSearch = useRef('');
  const activeSubject = useRef<string | null>(null);

  const fetchCourses = useCallback(async (
    pageNum: number,
    q: string,
    subject: string | null,
    replace: boolean,
    fromRefresh = false,
  ) => {
    if (fromRefresh) setRefreshing(true);
    else if (replace) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ type: 'video_course', page: String(pageNum), limit: '25' });
      if (q.trim()) params.set('q', q.trim());
      if (subject) params.set('subject', subject);

      const data = await apiRequest<{ data: VideoCourse[]; total: number }>(`/resources?${params}`);
      const rows: VideoCourse[] = data.data || [];

      setTotal(data.total || 0);
      setCourses(prev => replace || fromRefresh ? rows : [...prev, ...rows]);
      setHasMore(rows.length === 25);
    } catch (e) {
      console.error('video courses fetch:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses(1, '', null, true);
  }, [fetchCourses]);

  const selectCategory = (val: string | null) => {
    setActiveCategory(val);
    activeSubject.current = val;
    setPage(1);
    setHasMore(true);
    fetchCourses(1, activeSearch.current, val, true);
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    activeSearch.current = text;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setHasMore(true);
      fetchCourses(1, text, activeSubject.current, true);
    }, 400);
  };

  const loadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    fetchCourses(next, activeSearch.current, activeSubject.current, false);
  };

  const openCourse = (course: VideoCourse) => {
    navigation.navigate('CourseViewer', {
      title: course.title,
      url: course.file_url,
      subject: course.subject,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0714' }}>
      {/* Header */}
      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Courses' } })} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle}>{t('courses.title')}</Text>
              {total > 0 && (
                <Text style={styles.headerSub}>{total.toLocaleString()}{t('courses.free_count')}</Text>
              )}
            </View>
            <View style={{ width: 38 }} />
          </View>

          {/* Search */}
          <View style={styles.searchBox}>
            <AppIcon name="searchOutline" size={18} color="rgba(255,255,255,0.5)" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('courses.search_placeholder')}
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={search}
              onChangeText={handleSearch}
              textAlign="right"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')}>
                <AppIcon name="closeCircle" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catRow}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingVertical: 10, gap: 8, alignItems: 'center' }}
      >
        {CATEGORIES.map(cat => {
          const active = activeCategory === cat.value;
          return (
            <TouchableOpacity
              key={cat.label}
              style={[styles.catChip, active && styles.catChipActive]}
              onPress={() => selectCategory(cat.value)}
            >
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text style={[styles.catText, active && styles.catTextActive]}>{lang === 'fr' ? cat.label : cat.labelAr}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={{ marginTop: 12, color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{t('courses.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <CourseCard course={item} onPress={() => openCourse(item)} />
          )}
          contentContainerStyle={{ padding: Spacing.lg, gap: 10, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchCourses(1, activeSearch.current, activeSubject.current, true, true)}
              tintColor="#6366F1"
            />
          }
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator style={{ marginVertical: 16 }} color="#6366F1" />
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={styles.emptyText}>{t('courses.empty')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#0A0714',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(124,58,237,0.35)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 8,
    marginBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#fff' },
  catRow: {
    backgroundColor: '#0A0714',
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 5,
  },
  catChipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  catIcon: { fontSize: 13 },
  catText: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  catTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#1A1A35',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardIconYT: { backgroundColor: 'rgba(255,0,0,0.12)' },
  cardIconWeb: { backgroundColor: 'rgba(99,102,241,0.15)' },
  cardContent: { flex: 1 },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F3F4F6',
    textAlign: 'right',
    lineHeight: 19,
  },
  cardSubject: {
    fontSize: 11,
    color: '#818CF8',
    textAlign: 'right',
    marginTop: 3,
    fontWeight: '500',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
    justifyContent: 'flex-end',
  },
  domainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  domainBadgeYT: { backgroundColor: 'rgba(255,0,0,0.12)' },
  domainBadgeWeb: { backgroundColor: 'rgba(99,102,241,0.12)' },
  domainText: { fontSize: 10, fontWeight: '600' },
  domainTextYT: { color: '#FF0000' },
  domainTextWeb: { color: '#818CF8' },
  viewChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewText: { fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  empty: {
    alignItems: 'center',
    marginTop: 60,
    gap: 12,
  },
  emptyText: { fontSize: 15, color: 'rgba(255,255,255,0.4)' },
});

export default VideoCoursesScreen;
