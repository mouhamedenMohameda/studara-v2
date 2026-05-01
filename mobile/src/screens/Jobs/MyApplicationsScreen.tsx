import React, { useState, useMemo, useCallback } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, FlatList, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BorderRadius, Colors, Shadows } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { getAllJobApplications, removeJobApplication, JobApplication, JobApplicationStatus } from '../../utils/offlineStorage';
import { safeBack } from '../../utils/safeBack';
import { useTabBarContentPadding } from '../../hooks/useTabBarContentPadding';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<JobApplicationStatus, { labelAr: string; labelFr: string; color: string; icon: AppIconName }> = {
  applied:   { labelAr: 'تقدّمت',     labelFr: 'Candidaté',  color: '#3B82F6', icon: 'paperPlaneOutline' },
  interview: { labelAr: 'مقابلة',     labelFr: 'Entretien',  color: '#F59E0B', icon: 'peopleOutline' },
  offer:     { labelAr: 'عرض عمل',    labelFr: 'Offre reçue', color: '#10B981', icon: 'checkmarkCircleOutline' },
  rejected:  { labelAr: 'رُفضت',      labelFr: 'Refusé',     color: '#EF4444', icon: 'closeCircleOutline' },
};

const STATUS_ORDER: JobApplicationStatus[] = ['offer', 'interview', 'applied', 'rejected'];

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: C.background,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.textPrimary, letterSpacing: -0.4 },
  backBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.surface,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    ...Shadows.xs,
  },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 8, backgroundColor: C.background },
  statCard: {
    flex: 1, alignItems: 'center',
    backgroundColor: C.surfaceVariant,
    borderWidth: 1, borderColor: C.borderLight,
    borderRadius: BorderRadius.sm, paddingVertical: 11,
    ...Shadows.xs,
  },
  statNum:   { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  statLabel: { fontSize: 10, color: C.textMuted, marginTop: 3, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  list: { paddingHorizontal: 16, paddingTop: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 16 },
  sectionIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: C.surface, borderRadius: 18, marginBottom: 10,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#0F0A1F', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3,
    borderWidth: 1, borderColor: C.borderLight,
  },
  cardLeft: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 2 },
  cardCompany: { fontSize: 12, color: C.textMuted },
  cardDate: { fontSize: 11, color: C.textMuted, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  deleteBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.textSecondary, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
});

// ─── Application Card ─────────────────────────────────────────────────────────

const AppCard = React.memo(({ item, isAr, onDelete }: {
  item: JobApplication; isAr: boolean; onDelete: (id: string) => void;
}) => {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const cfg = STATUS_CONFIG[item.status];
  const date = new Date(item.appliedAt).toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <View style={styles.card}>
      <View style={[styles.statusBadge, { backgroundColor: cfg.color + '18' }]}>
        <AppIcon name={cfg.icon} size={18} color={cfg.color} />
      </View>
      <View style={styles.cardLeft}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardCompany}>{item.company}</Text>
        <Text style={styles.cardDate}>{isAr ? date : date}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: cfg.color + '22' }]}>
        <Text style={[styles.statusText, { color: cfg.color }]}>
          {isAr ? cfg.labelAr : cfg.labelFr}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => onDelete(item.jobId)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <AppIcon name="trashOutline" size={14} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MyApplicationsScreen() {
  const navigation = useNavigation();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const listBottomPad = useTabBarContentPadding(20);
  const { isAr } = useLanguage() as any;

  const [applications, setApplications] = useState<JobApplication[]>([]);

  const reload = useCallback(async () => {
    const all = await getAllJobApplications();
    setApplications(all);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const handleDelete = useCallback((jobId: string) => {
    Alert.alert(
      isAr ? 'حذف الطلب' : 'Supprimer',
      isAr ? 'هل تريد حذف هذا الطلب؟' : 'Supprimer cette candidature ?',
      [
        { text: isAr ? 'إلغاء' : 'Annuler', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Supprimer', style: 'destructive',
          onPress: async () => {
            await removeJobApplication(jobId);
            reload();
          },
        },
      ],
    );
  }, [isAr, reload]);

  // Group by status in fixed order
  const grouped = useMemo(() => {
    return STATUS_ORDER
      .map(status => ({
        status,
        items: applications.filter(a => a.status === status),
      }))
      .filter(g => g.items.length > 0);
  }, [applications]);

  // Summary counts
  const counts = useMemo(() => ({
    total:     applications.length,
    offer:     applications.filter(a => a.status === 'offer').length,
    interview: applications.filter(a => a.status === 'interview').length,
    rejected:  applications.filter(a => a.status === 'rejected').length,
  }), [applications]);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Jobs' } })}>
            <AppIcon name="arrowBack" size={18} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isAr ? '📋 طلباتي' : '📋 Mes Candidatures'}
          </Text>
          <View style={{ width: 42 }} />
        </View>
        {applications.length > 0 && (
          <View style={styles.statsRow}>
            {[
              { num: counts.total,     label: isAr ? 'إجمالي' : 'Total',      color: C.textPrimary },
              { num: counts.offer,     label: isAr ? 'عروض' : 'Offres',       color: '#10B981' },
              { num: counts.interview, label: isAr ? 'مقابلات' : 'Entretiens', color: '#F59E0B' },
              { num: counts.rejected,  label: isAr ? 'رُفض' : 'Refus',       color: '#EF4444' },
            ].map(s => (
              <View key={s.label} style={styles.statCard}>
                <Text style={[styles.statNum, { color: s.color }]}>{s.num}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
      </SafeAreaView>

      {applications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <AppIcon name="briefcaseOutline" size={64} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>
            {isAr ? 'لا توجد طلبات بعد' : 'Aucune candidature'}
          </Text>
          <Text style={styles.emptySub}>
            {isAr
              ? 'ابحث عن فرص عمل وتقدّم إليها لمتابعتها هنا'
              : 'Parcourez les offres d\'emploi et postulez pour les suivre ici'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={g => g.status}
          contentContainerStyle={[styles.list, { paddingBottom: listBottomPad }]}
          renderItem={({ item: group }) => {
            const cfg = STATUS_CONFIG[group.status];
            return (
              <View>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: cfg.color + '22' }]}>
                    <AppIcon name={cfg.icon} size={14} color={cfg.color} />
                  </View>
                  <Text style={[styles.sectionTitle, { color: cfg.color }]}>
                    {isAr ? cfg.labelAr : cfg.labelFr}
                    {' '}({group.items.length})
                  </Text>
                </View>
                {group.items.map(item => (
                  <AppCard key={item.jobId} item={item} isAr={isAr} onDelete={handleDelete} />
                ))}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
