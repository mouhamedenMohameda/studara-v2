import React, { useCallback } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { MySubmission } from '../../types';
import { apiRequest } from '../../utils/api';
import { queryKeys } from '../../utils/queryKeys';
import { safeBack } from '../../utils/safeBack';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending: {
    label_ar: 'قيد المراجعة',
    label_fr: 'En attente',
    color:  '#D97706',
    bg:     '#FEF3C7',
    icon:   'timeOutline' as const,
  },
  approved: {
    label_ar: 'منشور',
    label_fr: 'Publié',
    color:  Colors.primary,
    bg:     '#D1FAE5',
    icon:   'checkmarkCircleOutline' as const,
  },
  rejected: {
    label_ar: 'مرفوض',
    label_fr: 'Rejeté',
    color:  '#DC2626',
    bg:     '#FEE2E2',
    icon:   'closeCircleOutline' as const,
  },
};

const TYPE_ICONS: Record<string, AppIconName> = {
  note:         'documentTextOutline',
  past_exam:    'schoolOutline',
  summary:      'layersOutline',
  exercise:     'pencilOutline',
  project:      'constructOutline',
  presentation: 'easelOutline',
  video_course: 'playCircleOutline',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (iso: string, lang: 'ar' | 'fr') => {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SubmissionCard = ({
  item, lang,
}: { item: MySubmission; lang: 'ar' | 'fr' }) => {
  const cfg = STATUS_CFG[item.status];
  const typeIcon = TYPE_ICONS[item.resource_type] ?? 'documentOutline';

  return (
    <View style={styles.card}>
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={[styles.typeIcon, { backgroundColor: Colors.primary + '15' }]}>
          <AppIcon name={typeIcon} size={20} color={Colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {lang === 'ar' ? (item.title_ar || item.title) : item.title}
          </Text>
          <Text style={styles.cardSubject}>{item.subject}</Text>
        </View>
        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <AppIcon name={cfg.icon} size={12} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {lang === 'ar' ? cfg.label_ar : cfg.label_fr}
          </Text>
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <AppIcon name="calendarOutline" size={11} color={Colors.textMuted} />
          <Text style={styles.metaText}>{formatDate(item.created_at, lang)}</Text>
        </View>
        {item.file_size ? (
          <View style={styles.metaChip}>
            <AppIcon name="documentOutline" size={11} color={Colors.textMuted} />
            <Text style={styles.metaText}>{formatSize(item.file_size)}</Text>
          </View>
        ) : null}
        {item.status === 'approved' && (
          <View style={styles.metaChip}>
            <AppIcon name="arrowDownCircleOutline" size={11} color={Colors.textMuted} />
            <Text style={styles.metaText}>{item.downloads}</Text>
          </View>
        )}
      </View>

      {/* Rejection reason */}
      {item.status === 'rejected' && item.rejection_reason && (
        <View style={styles.rejectionBox}>
          <AppIcon name="alertCircleOutline" size={14} color="#DC2626" />
          <Text style={styles.rejectionText}>
            {lang === 'ar' ? 'سبب الرفض: ' : 'Raison du rejet : '}
            {item.rejection_reason}
          </Text>
        </View>
      )}

      {/* Pending info */}
      {item.status === 'pending' && (
        <View style={styles.pendingBox}>
          <AppIcon name="informationCircleOutline" size={14} color="#D97706" />
          <Text style={styles.pendingText}>
            {lang === 'ar'
              ? 'سيتم مراجعته قريباً. لن يظهر للطلاب قبل الموافقة.'
              : "En cours d'examen. Ne sera visible qu'après validation."}
          </Text>
        </View>
      )}
    </View>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MySubmissionsScreen() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const { lang } = useLanguage();

  const { data, isLoading, isRefetching, refetch } = useQuery<MySubmission[]>({
    queryKey: queryKeys.resources.mySubmissions(),
    queryFn:  () => apiRequest<MySubmission[]>('/resources/my-submissions', { token }),
    enabled:  !!token,
  });

  const renderItem = useCallback(({ item }: { item: MySubmission }) => (
    <SubmissionCard item={item} lang={lang} />
  ), [lang]);

  const keyExtractor = useCallback((item: MySubmission) => item.id, []);

  const counts = {
    pending:  data?.filter(r => r.status === 'pending').length  ?? 0,
    approved: data?.filter(r => r.status === 'approved').length ?? 0,
    rejected: data?.filter(r => r.status === 'rejected').length ?? 0,
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(navigation, { name: 'Explore', params: { screen: 'Resources' } })} style={styles.backBtn} activeOpacity={0.75}>
            <AppIcon name="arrowBack" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {lang === 'ar' ? 'مساهماتي' : 'Mes contributions'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Summary strip */}
        {data && data.length > 0 && (
          <View style={styles.summaryStrip}>
            {(['pending', 'approved', 'rejected'] as const).map(s => {
              const cfg = STATUS_CFG[s];
              return (
                <View key={s} style={[styles.summaryChip, { backgroundColor: cfg.bg }]}>
                  <AppIcon name={cfg.icon} size={13} color={cfg.color} />
                  <Text style={[styles.summaryCount, { color: cfg.color }]}>{counts[s]}</Text>
                  <Text style={[styles.summaryLabel, { color: cfg.color }]}>
                    {lang === 'ar' ? cfg.label_ar : cfg.label_fr}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </SafeAreaView>

      {/* Loading */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : !data?.length ? (
        /* Empty */
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <AppIcon name="cloudUploadOutline" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {lang === 'ar' ? 'لم ترفع أي مستند بعد' : 'Aucun document soumis'}
          </Text>
          <Text style={styles.emptySub}>
            {lang === 'ar'
              ? 'شارك مستنداتك مع زملائك الطلاب'
              : 'Partagez vos documents avec vos camarades'}
          </Text>
          <TouchableOpacity
            style={styles.uploadCta}
            onPress={() => navigation.navigate('UploadResource')}
            activeOpacity={0.82}
          >
            <AppIcon name='add' size={18} color="#fff" />
            <Text style={styles.uploadCtaText}>
              {lang === 'ar' ? 'رفع مستند' : 'Soumettre un document'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120, gap: 12 }}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3,
  },

  summaryStrip: {
    flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.lg, paddingBottom: 14,
  },
  summaryChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 12,
  },
  summaryCount: { fontSize: 14, fontWeight: '900' },
  summaryLabel: { fontSize: 10, fontWeight: '600' },

  /* Card */
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: 14, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  typeIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 20 },
  cardSubject: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, flexShrink: 0, alignSelf: 'flex-start',
  },
  statusText: { fontSize: 10, fontWeight: '800' },

  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: Colors.textMuted },

  rejectionBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#FECACA',
  },
  rejectionText: { flex: 1, fontSize: 12, color: '#DC2626', lineHeight: 18, fontWeight: '500' },

  pendingBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  pendingText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },

  /* Empty */
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: 12,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  uploadCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, paddingHorizontal: 22,
    paddingVertical: 12, borderRadius: BorderRadius.pill, marginTop: 8,
  },
  uploadCtaText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
