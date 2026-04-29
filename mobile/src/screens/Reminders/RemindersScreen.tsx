import React, { useState, useCallback, useMemo } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, Alert, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { ReminderType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { scheduleReminderNotification, cancelReminderNotification } from '../../utils/notifications';
import { useNavigation } from '@react-navigation/native';
import { safeBack } from '../../utils/safeBack';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';

import { apiRequest } from '../../utils/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';

const TYPE_CONFIG: Record<ReminderType, { icon: AppIconName; color: string }> = {
  [ReminderType.Exam]:       { icon: 'schoolOutline',                    color: '#DC2626' },
  [ReminderType.Assignment]: { icon: 'documentTextOutline',              color: '#7C3AED' },
  [ReminderType.Course]:     { icon: 'bookOutline',                       color: '#2563EB' },
  [ReminderType.Other]:      { icon: 'ellipsisHorizontalCircleOutline', color: '#6B7280' },
};

const defaultDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
};

const emptyForm = {
  title: '',
  description: '',
  type: ReminderType.Exam,
  pickedDate: defaultDate(),
  scope: 'personal' as 'personal' | 'global',
};

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  header: { paddingBottom: 10, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: 10, paddingBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: 10, paddingBottom: 14 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  tabActive: {
    backgroundColor: '#fff', borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  tabText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  tabTextActive: { color: '#EC4899' },
  tabBadge: { backgroundColor: Colors.error, borderRadius: 999, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  listContent: { padding: Spacing.lg, paddingBottom: 120 },
  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.textMuted, textAlign: 'right', marginBottom: 8, letterSpacing: 0.5 },
  card: {
    backgroundColor: C.surface, borderRadius: BorderRadius['2xl'],
    padding: Spacing.base, flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 10,
    ...Shadows.sm,
    borderWidth: 1, borderColor: C.borderLight,
  },
  cardFaded: { opacity: 0.65 },
  checkBtn: { padding: 2 },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: C.textPrimary, textAlign: 'right' },
  strikethrough: { textDecorationLine: 'line-through', color: C.textMuted },
  cardDesc: { fontSize: 12, color: C.textMuted, textAlign: 'right', marginTop: 2 },
  submitterText: { fontSize: 11, color: C.textMuted, textAlign: 'right', marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
  dateText: { fontSize: 12, fontWeight: '700' },
  typeBadge: { fontSize: 11, color: C.textMuted, backgroundColor: C.surfaceVariant, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  actionBtn: { padding: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: C.textPrimary },
  emptySub: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EC4899',
    paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 999, marginTop: 10,
    shadowColor: '#EC4899', shadowOpacity: 0.38, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  emptyAddText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: C.textPrimary },
  cancelText: { fontSize: 15, color: Colors.error },
  saveText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  modalBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  field: { marginBottom: Spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.textSecondary, textAlign: 'right', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 11, fontSize: 15, color: C.textPrimary, backgroundColor: C.surfaceWarm },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeChip: { flex: 1, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  scopeChipActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  scopeChipText: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  scopeChipTextActive: { color: '#D97706' },
  globalNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#EDE9FE', borderRadius: 8, padding: 8 },
  globalNoteText: { fontSize: 12, color: '#5B21B6', textAlign: 'right', flex: 1 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 14, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: C.border },
  typeChipText: { fontSize: 13, color: C.textMuted },
  dateTimeRow: { flexDirection: 'row', gap: 10 },
  dateBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#FDE68A', borderRadius: BorderRadius.md, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#FFFBEB' },
  timeBtn: { flex: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  dateBtnText: { fontSize: 13, fontWeight: '600', color: '#D97706', textAlign: 'center' },
});

// ─── Sub-components (outside RemindersScreen to avoid recreation on re-render) ─

interface ReminderCardProps {
  item: any;
  faded?: boolean;
  activeTab: 'personal' | 'global';
  userId: string | undefined;
  lang: 'ar' | 'fr';
  typeLabels: Record<ReminderType, string>;
  pendingLabel: string;
  rejectedLabel: string;
  onToggle: (item: any) => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}

const ReminderCard = React.memo(({
  item, faded = false, activeTab, userId, lang,
  typeLabels, pendingLabel, rejectedLabel,
  onToggle, onEdit, onDelete,
}: ReminderCardProps) => {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const cfg = TYPE_CONFIG[item.reminder_type as ReminderType] || TYPE_CONFIG[ReminderType.Other];
  const isOwner = item.submitted_by === userId;
  const statusBadge =
    item.status === 'pending'  ? { label: pendingLabel,  color: '#F59E0B', bg: '#FEF3C7' } :
    item.status === 'rejected' ? { label: rejectedLabel, color: '#EF4444', bg: '#FEE2E2' } :
    null;
  return (
    <View style={[styles.card, faded && styles.cardFaded]}>
      {activeTab === 'personal' && (
        <TouchableOpacity style={styles.checkBtn} onPress={() => onToggle(item)}>
          <AppIcon name={item.is_completed ? 'checkmarkCircle' : 'ellipseOutline'} size={24} color={item.is_completed ? '#10B981' : '#D1D5DB'} />
        </TouchableOpacity>
      )}
      <View style={[styles.typeIcon, { backgroundColor: cfg.color + '18' }]}>
        <AppIcon name={cfg.icon} size={18} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, item.is_completed && styles.strikethrough]}>{item.title}</Text>
        {item.description ? <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text> : null}
        {activeTab === 'global' && item.submitter_name ? <Text style={styles.submitterText}>بواسطة: {item.submitter_name}</Text> : null}
        <View style={styles.cardMeta}>
          <Text style={[styles.dateText, { color: cfg.color }]}>{formatRelativeDate(item.scheduled_at, lang)}</Text>
          {statusBadge ? (
            <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
            </View>
          ) : <Text style={styles.typeBadge}>{typeLabels[item.reminder_type as ReminderType]}</Text>}
        </View>
      </View>
      {(activeTab === 'personal' || isOwner) && (
        <>
          <TouchableOpacity onPress={() => onEdit(item)} style={styles.actionBtn}><AppIcon name="pencilOutline" size={15} color={C.textMuted} /></TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(item)} style={styles.actionBtn}><AppIcon name="trashOutline" size={15} color={Colors.error} /></TouchableOpacity>
        </>
      )}
    </View>
  );
});

interface SectionProps {
  title: string;
  data: any[];
  faded?: boolean;
  cardProps: Omit<ReminderCardProps, 'item' | 'faded'>;
}

const Section = React.memo(({ title, data, faded, cardProps }: SectionProps) => {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return data.length === 0 ? null : (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {data.map(item => (
        <ReminderCard key={item.id} item={item} faded={faded} {...cardProps} />
      ))}
    </View>
  );
});

const formatRelativeDate = (iso: string, lang: 'ar' | 'fr'): string => {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (lang === 'fr') {
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Demain';
    if (diffDays === -1) return 'Hier';
    if (diffDays > 0 && diffDays <= 7) return `Dans ${diffDays} jour(s)`;
    if (diffDays < 0 && diffDays >= -7) return `Il y a ${Math.abs(diffDays)} jour(s)`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  if (diffDays === 0) return 'اليوم';
  if (diffDays === 1) return 'غداً';
  if (diffDays === -1) return 'أمس';
  if (diffDays > 0 && diffDays <= 7) return `بعد ${diffDays} أيام`;
  if (diffDays < 0 && diffDays >= -7) return `منذ ${Math.abs(diffDays)} أيام`;
  return date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
};

const RemindersScreen = () => {
  const { token, user } = useAuth();
  const { t, lang } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation();
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

  const TYPE_LABELS: Record<ReminderType, string> = {
    [ReminderType.Exam]:       t('rem.type.exam'),
    [ReminderType.Assignment]: t('rem.type.assignment'),
    [ReminderType.Course]:     t('rem.type.course'),
    [ReminderType.Other]:      t('rem.type.other'),
  };
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'personal' | 'global'>('personal');
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState(emptyForm);
  const [editId, setEditId]         = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const { data: personalList = [], isLoading: loadingPersonal, isRefetching: refreshingPersonal, refetch: refetchPersonal } = useQuery({
    queryKey: queryKeys.reminders.personal(),
    queryFn: () => apiRequest<any[]>('/reminders?scope=personal', { token: token! }),
    enabled: !!token,
  });
  const { data: globalList = [], isLoading: loadingGlobal, isRefetching: refreshingGlobal, refetch: refetchGlobal } = useQuery({
    queryKey: queryKeys.reminders.global(),
    queryFn: () => apiRequest<any[]>('/reminders?scope=global', { token: token! }),
    enabled: !!token,
  });
  const loading   = loadingPersonal || loadingGlobal;
  const refreshing = refreshingPersonal || refreshingGlobal;

  useFocusEffect(useCallback(() => {
    refetchPersonal();
    refetchGlobal();
  }, [refetchPersonal, refetchGlobal]));

  const openAdd = () => {
    setForm({ ...emptyForm, pickedDate: defaultDate(), scope: activeTab });
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (r: any) => {
    const parsed = r.scheduled_at ? new Date(r.scheduled_at) : defaultDate();
    setForm({
      title: r.title,
      description: r.description || '',
      type: r.reminder_type || r.type,
      pickedDate: parsed,
      scope: r.scope || activeTab,
    });
    setEditId(r.id);
    setShowModal(true);
  };

  const saveMutation = useMutation({
    mutationFn: ({ isEdit, body }: { isEdit: boolean; body: object }) =>
      apiRequest<{ id: string; title: string; description: string; reminder_type: string; scheduled_at: string }>(
        isEdit ? `/reminders/${editId}` : '/reminders',
        { method: isEdit ? 'PUT' : 'POST', token: token!, body },
      ),
    onSuccess: async (data, vars) => {
      if (!vars.isEdit && form.scope === 'global') {
        Alert.alert('تم الإرسال', 'سيتم مراجعة التذكير العام قبل نشره للطلاب.');
      }
      if (form.scope === 'personal') {
        await scheduleReminderNotification({
          id: data.id,
          title: data.title,
          description: data.description,
          reminderType: data.reminder_type,
          scheduledAt: data.scheduled_at,
        }).catch(() => {});
      }
      setShowModal(false);
      qc.invalidateQueries({ queryKey: queryKeys.reminders.personal() });
      qc.invalidateQueries({ queryKey: queryKeys.reminders.global() });
    },
    onError: (e: any) => Alert.alert('خطأ', e.message),
  });

  const handleSave = () => {
    if (!form.title.trim()) return Alert.alert('خطأ', 'العنوان مطلوب');
    const scheduledAt = form.pickedDate.toISOString();
    const body = { title: form.title, description: form.description, reminderType: form.type, scheduledAt, scope: form.scope };
    saveMutation.mutate({ isEdit: !!editId, body });
  };

  const toggleMutation = useMutation({
    mutationFn: (r: any) => apiRequest(`/reminders/${r.id}`, {
      method: 'PUT', token: token!, body: { isCompleted: !r.is_completed },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reminders.personal() }),
    onError: (e: any) => Alert.alert('خطأ', e.message),
  });

  const toggleComplete = (r: any) => {
    if (r.scope === 'global') return;
    toggleMutation.mutate(r);
  };

  const deleteMutation = useMutation({
    mutationFn: (r: any) => apiRequest(`/reminders/${r.id}`, { method: 'DELETE', token: token! }),
    onSuccess: async (_, r) => {
      await cancelReminderNotification(r.id).catch(() => {});
      qc.invalidateQueries({ queryKey: queryKeys.reminders.personal() });
      qc.invalidateQueries({ queryKey: queryKeys.reminders.global() });
    },
    onError: (e: any) => Alert.alert('خطأ', e.message),
  });

  const deleteReminder = (r: any) => {
    Alert.alert(
      t('rem.delete_title'),
      t('rem.delete_msg'),
      [
        { text: t('rem.modal.cancel'), style: 'cancel' },
        { text: lang === 'fr' ? 'Supprimer' : 'حذف', style: 'destructive', onPress: () => deleteMutation.mutate(r) },
      ],
    );
  };

  const list     = activeTab === 'personal' ? personalList : globalList;
  const pending  = list.filter(r => r.status === 'pending');
  const rejected = list.filter(r => r.status === 'rejected');
  const active   = activeTab === 'personal'
    ? list.filter(r => !r.is_completed && r.status === 'active')
    : list.filter(r => r.status === 'approved');
  const done     = activeTab === 'personal' ? list.filter(r => r.is_completed) : [];

  const cardProps: Omit<ReminderCardProps, 'item' | 'faded'> = {
    activeTab,
    userId: user?.id,
    lang,
    typeLabels: TYPE_LABELS,
    pendingLabel:  t('rem.status.pending'),
    rejectedLabel: t('rem.status.rejected'),
    onToggle:  toggleComplete,
    onEdit:    openEdit,
    onDelete:  deleteReminder,
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <LinearGradient
        colors={['#EC4899', '#F43F5E', '#F97316']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onBackPress}
              activeOpacity={0.75}
            >
              <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('rem.title')}</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.75}>
              <AppIcon name='add' size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.tabs}>
          {(['personal', 'global'] as const).map(tab => (
              <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab === 'personal' ? t('rem.tab_personal') : t('rem.tab_global')}</Text>
                {tab === 'global' && globalList.filter(r => r.status === 'approved').length > 0 && (
                  <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{globalList.filter(r => r.status === 'approved').length}</Text></View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#D97706" size="large" />
      ) : list.length === 0 ? (
        <View style={styles.emptyState}>
          <AppIcon name="alarmOutline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>{activeTab === 'personal' ? t('rem.empty.personal_title') : t('rem.empty.global_title')}</Text>
          <Text style={styles.emptySub}>{activeTab === 'personal' ? t('rem.empty.personal_sub') : (lang === 'fr' ? 'Ajoutez un rappel général pour le partager.' : 'أضف تذكيراً عاماً لمشاركته مع جميع الطلاب')}</Text>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd}>
            <AppIcon name="addCircle" size={18} color="#fff" />
            <Text style={styles.emptyAddText}>{t('rem.add')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { refetchPersonal(); refetchGlobal(); }} />}
        >
          {activeTab === 'personal' ? (
            <>
              <Section title={t('rem.section.overdue')} data={active.filter(r => new Date(r.scheduled_at) < new Date())} faded cardProps={cardProps} />
              <Section title={t('rem.section.active')}  data={active.filter(r => new Date(r.scheduled_at) >= new Date())} cardProps={cardProps} />
              <Section title={t('rem.section.done')}    data={done} faded cardProps={cardProps} />
            </>
          ) : (
            <>
              <Section title={t('rem.section.approved')} data={active}   cardProps={cardProps} />
              <Section title={t('rem.section.pending')}  data={pending}  faded cardProps={cardProps} />
              <Section title={t('rem.section.rejected')} data={rejected} faded cardProps={cardProps} />
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)}><Text style={styles.cancelText}>{t('rem.modal.cancel')}</Text></TouchableOpacity>
              <Text style={styles.modalTitle}>{editId ? t('rem.modal.edit') : t('rem.modal.new')}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <ActivityIndicator color={Colors.primary} size="small" /> : <Text style={styles.saveText}>{t('rem.modal.save')}</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {!editId && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('rem.field.scope')}</Text>
                  <View style={styles.scopeRow}>
                    {(['personal', 'global'] as const).map(s => (
                      <TouchableOpacity key={s} style={[styles.scopeChip, form.scope === s && styles.scopeChipActive]} onPress={() => setForm(f => ({ ...f, scope: s }))}>
                        <Text style={[styles.scopeChipText, form.scope === s && styles.scopeChipTextActive]}>{s === 'personal' ? t('rem.scope.personal') : t('rem.scope.global')}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {form.scope === 'global' && (
                    <View style={styles.globalNote}>
                      <AppIcon name="informationCircleOutline" size={16} color="#7C3AED" />
                      <Text style={styles.globalNoteText}>{t('rem.global_note')}</Text>
                    </View>
                  )}
                </View>
              )}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('rem.field.title')}</Text>
                <TextInput style={styles.input} placeholder={t('rem.field.title_placeholder')} placeholderTextColor={C.textMuted}
                  value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} textAlign="right"
                  autoCapitalize="none" autoComplete="off" autoCorrect={false} />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('rem.field.note')}</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder={t('rem.field.note_placeholder')} placeholderTextColor={C.textMuted}
                  value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} textAlign="right"
                  multiline autoCapitalize="none" autoComplete="off" autoCorrect={false} />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('rem.field.type')}</Text>
                <View style={styles.typeGrid}>
                  {(Object.values(ReminderType) as ReminderType[]).map(rt => {
                    const cfg = TYPE_CONFIG[rt];
                    const isActive = form.type === rt;
                    return (
                      <TouchableOpacity key={rt} style={[styles.typeChip, isActive && { backgroundColor: cfg.color + '18', borderColor: cfg.color }]} onPress={() => setForm(f => ({ ...f, type: rt }))}>
                        <AppIcon name={cfg.icon} size={16} color={isActive ? cfg.color : C.textMuted} />
                        <Text style={[styles.typeChipText, isActive && { color: cfg.color, fontWeight: '700' }]}>{TYPE_LABELS[rt]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('rem.field.datetime')} *</Text>
                <View style={styles.dateTimeRow}>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                    <AppIcon name="calendarOutline" size={16} color="#D97706" />
                    <Text style={styles.dateBtnText}>
                      {form.pickedDate.toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.dateBtn, styles.timeBtn]} onPress={() => setShowTimePicker(true)}>
                    <AppIcon name="timeOutline" size={16} color="#2563EB" />
                    <Text style={[styles.dateBtnText, { color: '#2563EB' }]}>
                      {form.pickedDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                </View>
                {showDatePicker && (
                  <DateTimePicker
                    value={form.pickedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={(_, d) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (d) {
                        const next = new Date(d);
                        next.setHours(form.pickedDate.getHours(), form.pickedDate.getMinutes(), 0, 0);
                        setForm(f => ({ ...f, pickedDate: next }));
                      }
                    }}
                  />
                )}
                {showTimePicker && (
                  <DateTimePicker
                    value={form.pickedDate}
                    mode='time'
                    is24Hour
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      setShowTimePicker(Platform.OS === 'ios');
                      if (d) {
                        const next = new Date(form.pickedDate);
                        next.setHours(d.getHours(), d.getMinutes(), 0, 0);
                        setForm(f => ({ ...f, pickedDate: next }));
                      }
                    }}
                  />
                )}
              </View>
              <View style={{ height: 30 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default RemindersScreen;
