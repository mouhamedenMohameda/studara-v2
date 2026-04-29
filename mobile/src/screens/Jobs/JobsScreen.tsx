import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Job, JobsStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, BorderRadius, Shadows, Colors, Gradients } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

import { API_BASE } from '../../utils/api';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';
import { getLastJobsVisit, setLastJobsVisit } from '../../utils/offlineStorage';
import { scheduleNewJobsNotification, requestNotificationPermissions } from '../../utils/notifications';
import { safeBack } from '../../utils/safeBack';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';
type Nav = StackNavigationProp<JobsStackParamList, 'JobsList'>;

const JOB_TYPE_COLORS: Record<string, string> = {
  stage: '#8B5CF6', cdi: Colors.primary, cdd: '#3B82F6', freelance: '#F59E0B', other: '#64748B',
};
const AVATAR_PALETTE = ['#EF4444','#F97316','#EAB308','#22C55E','#14B8A6','#3B82F6','#8B5CF6','#EC4899'];
const avatarColor = (s: string) => AVATAR_PALETTE[(s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % AVATAR_PALETTE.length];

// Domain DB values (keys sent to the API)
const DOMAIN_VALUES = ['Informatique', 'Ingénierie & BTP', 'Finance & Comptabilité', 'Marketing & Commercial', 'Ressources Humaines', 'Santé', 'Autre'];

/** Maps user faculty to likely matching job domains */
const FACULTY_DOMAINS: Record<string, string[]> = {
  sciences:    ['Informatique', 'Ingénierie & BTP'],
  engineering: ['Informatique', 'Ingénierie & BTP'],
  medicine:    ['Santé'],
  economics:   ['Finance & Comptabilité', 'Marketing & Commercial'],
  law:         ['Ressources Humaines'],
  arts:        ['Autre'],
  islamic:     ['Autre'],
};

const mapJob = (j: any): Job => ({
  id: j.id, title: j.title, company: j.company,
  location: j.location, domain: j.domain,
  jobType: j.job_type, description: j.description,
  requirements: j.requirements, applyUrl: j.apply_url,
  deadline: j.deadline, createdAt: j.created_at,
});

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  header: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, gap: 12 },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 3, textAlign: 'right', fontWeight: '700', letterSpacing: 0.4 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'right', letterSpacing: -0.6 },
  countPill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10,
    alignItems: 'center', minWidth: 72,
  },
  countNum:   { fontSize: 24, fontWeight: '900', color: '#fff', lineHeight: 28, letterSpacing: -0.5 },
  countLabel: { fontSize: 10, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  myAppBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start', marginHorizontal: 20, marginBottom: 14,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  myAppBtnText: { fontSize: 12, color: '#fff', fontWeight: '800' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderRadius: 18,
    marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 13,
    marginBottom: 14,
    shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 5,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.textPrimary, padding: 0, fontWeight: '500' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  chipActive: {
    backgroundColor: '#fff', borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  chipText:       { fontSize: 12, fontWeight: '800', color: '#fff' },
  chipTextActive: { color: '#F97316', fontWeight: '800' },
  card: {
    backgroundColor: C.surface, borderRadius: 20, marginBottom: 12,
    flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    borderWidth: 1, borderColor: C.borderLight,
  },
  accentBar: { width: 5 },
  cardInner: { flex: 1, padding: 14, gap: 7 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  avatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  jobTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, textAlign: 'right', lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'flex-end' },
  metaText: { fontSize: 12, color: C.textMuted, flex: 1, textAlign: 'right' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  domainChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  domainChipText: { fontSize: 11, fontWeight: '600' },
  dateText: { fontSize: 11, color: C.textMuted },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.textSecondary },
  emptySub:   { fontSize: 13, color: C.textMuted, textAlign: 'center' },
  retryBtn:   { marginTop: 8, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
});

interface JobCardProps {
  item: Job;
  typeLabels: Record<string, string>;
  domainLabels: Record<string, string>;
  onPress: (job: Job) => void;
}

const JobCard = React.memo(({ item, typeLabels, domainLabels, onPress }: JobCardProps) => {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const typeColor = JOB_TYPE_COLORS[item.jobType] ?? '#64748B';
  const initial   = (item.company || '?').trim().charAt(0).toUpperCase();
  const bg        = avatarColor(item.company || '?');
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item)}
      activeOpacity={0.72}
    >
      <View style={[styles.accentBar, { backgroundColor: typeColor }]} />
      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '18' }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>
              {typeLabels[item.jobType] ?? item.jobType}
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: bg }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        </View>
        <Text style={styles.jobTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.metaRow}>
          <AppIcon name="businessOutline" size={12} color="#94A3B8" />
          <Text style={styles.metaText} numberOfLines={1}>
            {item.company}{item.location ? ` · ${item.location}` : ''}
          </Text>
        </View>
        <View style={styles.cardFooter}>
          {item.domain ? (
            <View style={[styles.domainChip, { borderColor: typeColor + '50' }]}>
              <Text style={[styles.domainChipText, { color: typeColor }]}>
                {domainLabels[item.domain] ?? item.domain}
              </Text>
            </View>
          ) : <View />}
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function JobsScreen() {
  const navigation = useNavigation<Nav>();
  const { token, refreshAccessToken, logout } = useAuth();
  const { t, lang } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
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

  // Build label maps from translations — memoized so they don't recreate on every render
  const JOB_TYPE_LABELS = useMemo<Record<string, string>>(() => ({
    stage: t('jobs.type.stage'), cdi: t('jobs.type.cdi'), cdd: t('jobs.type.cdd'),
    freelance: t('jobs.type.freelance'), other: t('jobs.type.other'),
  }), [t]);
  const DOMAIN_LABELS = useMemo<Record<string, string>>(() => ({
    'Informatique':           t('jobs.domain.informatique'),
    'Ingénierie & BTP':       t('jobs.domain.ingenierie'),
    'Finance & Comptabilité':  t('jobs.domain.finance'),
    'Marketing & Commercial':  t('jobs.domain.marketing'),
    'Ressources Humaines':    t('jobs.domain.rh'),
    'Santé':                  t('jobs.domain.sante'),
    'Autre':                  t('jobs.domain.autre'),
  }), [t]);
  const DOMAINS = ['all', ...DOMAIN_VALUES];
  const [search, setSearch]       = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [domain, setDomain]       = useState('all');

  const { data, isLoading: loading, isRefetching: refreshing, isError, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.jobs(domain, activeSearch),
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '500' });
      if (domain !== 'all') params.set('domain', domain);
      if (activeSearch.trim()) params.set('search', activeSearch.trim());
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      let res = await fetch(`${API_BASE}/jobs?${params}`, { headers });

      // Auto-refresh on 401 then retry once
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const newToken = await AsyncStorage.getItem('@studara/token');
          const retryHeaders: Record<string, string> = {};
          if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;
          res = await fetch(`${API_BASE}/jobs?${params}`, { headers: retryHeaders });
        } else {
          await logout();
          throw new Error('Unauthorized');
        }
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || `خطأ ${res.status}`), { status: res.status });
      }

      const rawData = await res.json();
      const rawList = Array.isArray(rawData) ? rawData : (Array.isArray(rawData.data) ? rawData.data : []);
      const total: number = rawData.total ?? rawList.length;
      const mapped: Job[] = rawList.map(mapJob);
      const now = Date.now();
      mapped.sort((a, b) => {
        const aExpired = a.deadline ? new Date(a.deadline).getTime() < now : false;
        const bExpired = b.deadline ? new Date(b.deadline).getTime() < now : false;
        if (aExpired !== bExpired) return aExpired ? 1 : -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      return { jobs: mapped, total };
    },
    enabled: !!token,
  });

  const jobs  = data?.jobs  ?? [];
  const total = data?.total ?? 0;

  const error = isError ? (queryError as Error)?.message ?? t('jobs.error.connection') : null;

  // ── New-jobs alert ───────────────────────────────────────────────────
  const { user } = useAuth();
  useEffect(() => {
    if (!jobs.length) return;
    (async () => {
      const lastVisit = await getLastJobsVisit();
      const faculty   = user?.faculty ?? '';
      const myDomains = FACULTY_DOMAINS[faculty] ?? [];

      if (lastVisit > 0 && myDomains.length > 0) {
        const newMatching = jobs.filter(j => {
          const isNew    = j.createdAt ? new Date(j.createdAt).getTime() > lastVisit : false;
          const matches  = !j.domain || myDomains.includes(j.domain);
          return isNew && matches;
        });
        if (newMatching.length > 0) {
          const granted = await requestNotificationPermissions();
          if (granted) {
            const domainLabel = myDomains[0];
            await scheduleNewJobsNotification(newMatching.length, domainLabel).catch(() => {});
          }
        }
      }

      // Update last-visit timestamp
      await setLastJobsVisit();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const handleJobPress = useCallback((job: Job) => {
    navigation.navigate('JobDetail', { job });
  }, [navigation]);

  const renderJob = useCallback(({ item }: { item: Job }) => (
    <JobCard
      item={item}
      typeLabels={JOB_TYPE_LABELS}
      domainLabels={DOMAIN_LABELS}
      onPress={handleJobPress}
    />
  ), [JOB_TYPE_LABELS, DOMAIN_LABELS, handleJobPress]);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primaryDark} />
      <LinearGradient
        colors={['#F97316', '#EC4899', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          {/* Row 1: title + count pill */}
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onBackPress}
              activeOpacity={0.75}
            >
              <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ alignItems: 'flex-end', flex: 1 }}>
              <Text style={styles.headerSub}>{t('jobs.subtitle')}</Text>
              <Text style={styles.headerTitle}>{t('jobs.title')}</Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countNum}>{total}</Text>
              <Text style={styles.countLabel}>{t('jobs.opportunity')}</Text>
            </View>
          </View>
          {/* Row 2: my applications button */}
          <TouchableOpacity
            style={styles.myAppBtn}
            onPress={() => navigation.navigate('MyApplications')}
            activeOpacity={0.75}
          >
            <AppIcon name="briefcaseOutline" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.myAppBtnText}>{t('jobs.myApplications') || 'طلباتي'}</Text>
            <AppIcon name="chevronBack" size={12} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          <View style={styles.searchBar}>
            <AppIcon name='search' size={16} color={Colors.primary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('jobs.search.placeholder')}
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => setActiveSearch(search.trim())}
              returnKeyType='search'
              textAlign="right"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setActiveSearch(''); }}>
                <AppIcon name="closeCircle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            horizontal data={DOMAINS} keyExtractor={d => d}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 14 }}
            renderItem={({ item: d }) => (
              <TouchableOpacity
                style={[styles.chip, domain === d && styles.chipActive]}
                onPress={() => setDomain(d)}
              >
                <Text style={[styles.chipText, domain === d && styles.chipTextActive]}>
                  {d === 'all' ? t('jobs.filter.all') : (DOMAIN_LABELS[d] ?? d)}
                </Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 80 }} color={Colors.primary} size="large" />
      ) : error ? (
        <View style={styles.centered}>
          <AppIcon name="cloudOfflineOutline" size={60} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>{t('jobs.error.title')}</Text>
          <Text style={styles.emptySub}>{error}</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('jobs.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : jobs.length === 0 ? (
        <View style={styles.centered}>
          <AppIcon name="briefcaseOutline" size={60} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>{t('jobs.empty.title')}</Text>
          <Text style={styles.emptySub}>{t('jobs.empty.sub')}</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={j => j.id}
          renderItem={renderJob}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={8}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />
          }
        />
      )}
    </View>
  );
}

