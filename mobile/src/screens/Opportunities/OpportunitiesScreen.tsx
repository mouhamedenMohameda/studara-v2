import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, RefreshControl, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';

import { Opportunity, OpportunitiesStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../theme';
import { API_BASE } from '../../utils/api';
import { queryKeys } from '../../utils/queryKeys';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';

type Nav = StackNavigationProp<OpportunitiesStackParamList, 'OpportunitiesList'>;

const TYPE_COLORS: Record<string, string> = {
  program: '#3B82F6',
  scholarship: '#7C3AED',
  exchange: '#2563EB',
  internship: '#F97316',
  fellowship: '#10B981',
  grant: '#EF4444',
  summer_school: '#EAB308',
  other: '#64748B',
};

const mapOpportunity = (o: any): Opportunity => ({
  id: o.id,
  title: o.title,
  opportunityType: o.opportunity_type,
  providerName: o.provider_name,
  hostCountry: o.host_country,
  hostCity: o.host_city,
  hostInstitution: o.host_institution,
  programLevel: o.program_level,
  programDurationText: o.program_duration_text,
  programDurationMonths: o.program_duration_months,
  description: o.description,
  eligibility: o.eligibility,
  benefits: o.benefits,
  hasScholarship: o.has_scholarship,
  scholarshipDetails: o.scholarship_details,
  applyUrl: o.apply_url,
  officialUrl: o.official_url,
  deadline: o.deadline,
  createdAt: o.created_at,
});

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const makeStyles = (C: any) => StyleSheet.create({
  header: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, gap: 12 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 3, textAlign: 'right', fontWeight: '700', letterSpacing: 0.4 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff', textAlign: 'right', letterSpacing: -0.6 },
  countPill: { backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', minWidth: 72 },
  countNum: { fontSize: 24, fontWeight: '900', color: '#fff', lineHeight: 28, letterSpacing: -0.5 },
  countLabel: { fontSize: 10, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 18, marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 14, shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 5 },
  searchInput: { flex: 1, fontSize: 14, color: C.textPrimary, padding: 0, fontWeight: '500' },
  card: { backgroundColor: C.surface, borderRadius: 20, marginBottom: 12, flexDirection: 'row', overflow: 'hidden', shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: C.borderLight },
  accentBar: { width: 5 },
  cardInner: { flex: 1, padding: 14, gap: 7 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '800', color: C.textPrimary, textAlign: 'right', lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'flex-end' },
  metaText: { fontSize: 12, color: C.textMuted, flex: 1, textAlign: 'right' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  dateText: { fontSize: 11, color: C.textMuted },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.textSecondary },
  emptySub: { fontSize: 13, color: C.textMuted, textAlign: 'center' },
  retryBtn: { marginTop: 8, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

const OpportunityCard = React.memo(({ item, onPress, typeLabel }: { item: Opportunity; onPress: (o: Opportunity) => void; typeLabel: (t: Opportunity['opportunityType']) => string }) => {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const color = TYPE_COLORS[item.opportunityType] ?? '#64748B';
  const provider = item.providerName || item.hostInstitution || '';
  const where = [item.hostCountry, item.hostCity].filter(Boolean).join(' · ');
  const meta = [item.programLevel, item.programDurationText].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.72}>
      <View style={[styles.accentBar, { backgroundColor: color }]} />
      <View style={styles.cardInner}>
        <View style={styles.rowTop}>
          <View style={[styles.typeBadge, { backgroundColor: color + '18' }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{typeLabel(item.opportunityType)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              const url = item.officialUrl || item.applyUrl;
              if (!url) return;
              Linking.openURL(url).catch(() => Alert.alert('Erreur', 'Impossible d’ouvrir le lien'));
            }}
            activeOpacity={0.8}
          >
            <AppIcon name="openOutline" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {!!provider && (
          <View style={styles.metaRow}>
            <AppIcon name="businessOutline" size={12} color="#94A3B8" />
            <Text style={styles.metaText} numberOfLines={1}>{provider}</Text>
          </View>
        )}
        {!!where && (
          <View style={styles.metaRow}>
            <AppIcon name="locationOutline" size={12} color="#94A3B8" />
            <Text style={styles.metaText} numberOfLines={1}>{where}</Text>
          </View>
        )}
        {!!meta && (
          <View style={styles.metaRow}>
            <AppIcon name="schoolOutline" size={12} color="#94A3B8" />
            <Text style={styles.metaText} numberOfLines={1}>{meta}</Text>
          </View>
        )}
        <View style={styles.footer}>
          <Text style={styles.dateText}>
            {item.hasScholarship ? '💰 Bourse: Oui · ' : '💰 Bourse: Non · '}
            {item.deadline ? `⏰ ${formatDate(item.deadline)}` : formatDate(item.createdAt)}
          </Text>
          <View />
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function OpportunitiesScreen() {
  const navigation = useNavigation<Nav>();
  const { token, refreshAccessToken, logout } = useAuth();
  const { t, lang } = useLanguage();
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isAr = lang === 'ar';

  const goHomeTab = useCallback(() => { smoothGoHomeTab(navigation as any); }, [navigation]);
  const onBackPress = useCallback(() => {
    if ((navigation as any)?.canGoBack?.()) {
      (navigation as any).goBack?.();
      return;
    }
    goHomeTab();
  }, [navigation, goHomeTab]);

  const typeLabel = useCallback((type: Opportunity['opportunityType']) => {
    const key = `opp.type.${type}` as any;
    return (t(key) as any) || type;
  }, [t]);

  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const { data, isLoading: loading, isRefetching: refreshing, isError, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.opportunities(activeSearch),
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' });
      if (activeSearch.trim()) params.set('search', activeSearch.trim());
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      let res = await fetch(`${API_BASE}/opportunities?${params}`, { headers });

      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const newToken = await AsyncStorage.getItem('@studara/token');
          const retryHeaders: Record<string, string> = {};
          if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;
          res = await fetch(`${API_BASE}/opportunities?${params}`, { headers: retryHeaders });
        } else {
          await logout();
          throw new Error('Unauthorized');
        }
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || `Erreur ${res.status}`), { status: res.status });
      }
      const rawData = await res.json();
      const rawList = Array.isArray(rawData) ? rawData : (Array.isArray(rawData.data) ? rawData.data : []);
      const total: number = rawData.total ?? rawList.length;
      const mapped: Opportunity[] = rawList.map(mapOpportunity);
      return { items: mapped, total };
    },
    enabled: !!token,
  });

  const opportunities = data?.items ?? [];
  const total = data?.total ?? 0;
  const error = isError ? (queryError as Error)?.message ?? t('opp.error.connection') : null;

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const handlePress = useCallback((opportunity: Opportunity) => {
    navigation.navigate('OpportunityDetail', { opportunity });
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: Opportunity }) => (
    <OpportunityCard item={item} onPress={handlePress} typeLabel={typeLabel} />
  ), [handlePress, typeLabel]);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primaryDark} />
      <LinearGradient colors={['#0EA5E9', '#7C3AED', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerTop}>
            <TouchableOpacity style={styles.backBtn} onPress={onBackPress} activeOpacity={0.75}>
              <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ alignItems: 'flex-end', flex: 1 }}>
              <Text style={styles.headerSub}>{t('opp.subtitle')}</Text>
              <Text style={styles.headerTitle}>{t('opp.title')}</Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countNum}>{total}</Text>
              <Text style={styles.countLabel}>{t('opp.countLabel')}</Text>
            </View>
          </View>

          <View style={styles.searchBar}>
            <AppIcon name="search" size={16} color={Colors.primary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('opp.search.placeholder')}
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => setActiveSearch(search.trim())}
              returnKeyType="search"
              textAlign="right"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setActiveSearch(''); }}>
                <AppIcon name="closeCircle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 80 }} color={Colors.primary} size="large" />
      ) : error ? (
        <View style={styles.centered}>
          <AppIcon name="cloudOfflineOutline" size={60} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>{t('opp.error.title')}</Text>
          <Text style={styles.emptySub}>{error}</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('opp.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : opportunities.length === 0 ? (
        <View style={styles.centered}>
          <AppIcon name="schoolOutline" size={60} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>{t('opp.empty.title')}</Text>
          <Text style={styles.emptySub}>{t('opp.empty.sub')}</Text>
        </View>
      ) : (
        <FlatList
          data={opportunities}
          keyExtractor={o => o.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={8}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />}
        />
      )}
    </View>
  );
}

