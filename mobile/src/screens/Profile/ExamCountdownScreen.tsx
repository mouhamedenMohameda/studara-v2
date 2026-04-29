import React, { useState, useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiRequest } from '../../utils/api';
import { queryKeys } from '../../utils/queryKeys';
import { ExamCountdown, ProfileStackParamList } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Shadows, BorderRadius, Gradients } from '../../theme';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { scheduleExamReminders, cancelExamReminders, requestNotificationPermissions } from '../../utils/notifications';
import { safeBack } from '../../utils/safeBack';

type Nav = StackNavigationProp<ProfileStackParamList, 'ExamCountdown'>;

const EXAM_COLORS = ['#DC2626', '#D97706', Colors.primary, '#2563EB', '#7C3AED', '#DB2777'];

const daysUntil = (dateStr: string) => {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((d.getTime() - today.getTime()) / 86400000));
};

const ExamCountdownScreen = () => {
  const { lang, t } = useLanguage();
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const isAr = lang === 'ar';
  const { token } = useAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [examDate, setExamDate] = useState(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [color, setColor] = useState(EXAM_COLORS[0]);

  const { data: exams = [], isLoading } = useQuery<ExamCountdown[]>({
    queryKey: queryKeys.exams(),
    queryFn:  () => apiRequest('/exams', { token }),
  });

  const addMutation = useMutation({
    mutationFn: (payload: { subject: string; examDate: string; color: string }) =>
      apiRequest<{ id: string }>('/exams', { method: 'POST', token, body: payload }),
    onSuccess: async (created, payload) => {
      qc.invalidateQueries({ queryKey: queryKeys.exams() });
      qc.invalidateQueries({ queryKey: queryKeys.home() });
      setModalOpen(false);
      setSubject('');
      setExamDate(new Date());
      setColor(EXAM_COLORS[0]);
      // Schedule exam reminders (J-7, J-3, J-1, J0)
      const granted = await requestNotificationPermissions();
      if (granted && created?.id) {
        scheduleExamReminders({ id: created.id, subject: payload.subject, examDate: payload.examDate }).catch(() => {});
      }
    },
    onError: (e: any) => Alert.alert(t('common.error'), e.message),
  });

  const doneMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/exams/${id}`, { method: 'PATCH', token, body: { isDone: true } }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: queryKeys.exams() }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/exams/${id}`, { method: 'DELETE', token }),
    onSuccess: (_data, id) => {
      cancelExamReminders(id).catch(() => {}); // remove scheduled notifications
      qc.invalidateQueries({ queryKey: queryKeys.exams() });
    },
  });

  const handleAdd = useCallback(() => {
    if (!subject.trim()) {
      Alert.alert('', t('exam.error_subject'));
      return;
    }
    addMutation.mutate({
      subject: subject.trim(),
      examDate: examDate.toISOString().split('T')[0],
      color,
    });
  }, [subject, examDate, color, addMutation, isAr]);

  const handleDelete = useCallback((id: string, sub: string) => {
    Alert.alert(
      isAr ? t('exam.delete_title') : t('exam.delete_title'),
      isAr ? `${t('exam.delete_title')} "${sub}"?` : `${t('exam.delete_title')} "${sub}"?`,
      [
        { text: t('exam.cancel'), style: 'cancel' },
        { text: t('exam.delete_title'), style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  }, [isAr, deleteMutation]);

  const upcoming = exams.filter(e => !e.isDone).sort(
    (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
  );
  const done = exams.filter(e => e.isDone);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
      <LinearGradient
        colors={Gradients.brand as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => safeBack(navigation, { name: 'Profile' })} style={styles.backBtn}>
              <AppIcon name="chevronBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>📅 {t('exam.title')}</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
              <AppIcon name='add' size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
        ) : upcoming.length === 0 && done.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>📅</Text>
            <Text style={styles.emptyTitle}>{t('exam.empty_title')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('exam.empty_sub')}
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalOpen(true)}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {t('exam.add_empty_btn')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {upcoming.map(exam => {
              const days = daysUntil(exam.examDate);
              return (
                <View key={exam.id} style={[styles.examCard, { borderLeftColor: exam.color, borderLeftWidth: 5 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.examSubject}>{exam.subject}</Text>
                    <Text style={styles.examDate}>
                      {new Date(exam.examDate).toLocaleDateString(isAr ? 'ar-SA' : 'fr-FR', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })}
                    </Text>
                    {exam.notes ? <Text style={styles.examNotes}>{exam.notes}</Text> : null}
                  </View>
                  <View style={styles.examRight}>
                    <View style={[styles.daysCircle, { backgroundColor: exam.color + '18' }]}>
                      <Text style={[styles.daysNum, { color: exam.color }]}>{days}</Text>
                      <Text style={[styles.daysLbl, { color: exam.color }]}>{t('exam.day_unit')}</Text>
                    </View>
                    <View style={styles.examActions}>
                      <TouchableOpacity
                        onPress={() => doneMutation.mutate(exam.id)}
                        style={styles.doneBtn}
                      >
                        <AppIcon name="checkmarkCircleOutline" size={22} color={Colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(exam.id, exam.subject)}>
                        <AppIcon name="trashOutline" size={20} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            {done.length > 0 && (
              <>
                <Text style={styles.doneSection}>{t('exam.done_section')}</Text>
                {done.map(exam => (
                  <View key={exam.id} style={[styles.examCard, styles.examDone]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.examSubject, { textDecorationLine: 'line-through', color: Colors.textMuted }]}>
                        {exam.subject}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(exam.id, exam.subject)}>
                      <AppIcon name="trashOutline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Add Exam Modal */}
      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setModalOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('exam.add')}</Text>

            <Text style={styles.fieldLabel}>{t('exam.field_subject')}</Text>
            <TextInput
              style={styles.fieldInput}
              value={subject}
              onChangeText={setSubject}
              placeholder={t('exam.placeholder_subject')}
              placeholderTextColor="#9CA3AF"
              textAlign={isAr ? 'right' : 'left'}
              autoFocus
            />

            <Text style={styles.fieldLabel}>{t('exam.field_date')}</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerOpen(true)}>
              <AppIcon name="calendarOutline" size={18} color={Colors.primary} />
              <Text style={styles.dateBtnText}>
                {examDate.toLocaleDateString(isAr ? 'ar-SA' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </TouchableOpacity>

            {pickerOpen && (
              <DateTimePicker
                value={examDate}
                mode="date"
                minimumDate={new Date()}
                onChange={(_e, d) => { setPickerOpen(false); if (d) setExamDate(d); }}
              />
            )}

            <Text style={styles.fieldLabel}>{t('exam.field_color')}</Text>
            <View style={styles.colorRow}>
              {EXAM_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorCircle, { backgroundColor: c }, color === c && styles.colorSelected]}
                  onPress={() => setColor(c)}
                >
                  {color === c && <AppIcon name='checkmark' size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalOpen(false)}>
                <Text style={{ fontWeight: '700', color: Colors.textMuted }}>{t('exam.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, addMutation.isPending && { opacity: 0.6 }]}
                onPress={handleAdd}
                disabled={addMutation.isPending}
              >
                {addMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontWeight: '700', color: '#fff' }}>{t('exam.add_btn')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 19, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -0.4 },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 32, fontWeight: '500', lineHeight: 21 },
  emptyBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 999, marginTop: 12,
    ...Shadows.brand,
  },
  examCard: {
    backgroundColor: Colors.surface, borderRadius: 20,
    padding: 16, marginBottom: 12, flexDirection: 'row',
    ...Shadows.sm,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  examDone: { opacity: 0.5 },
  examSubject: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.2 },
  examDate: { fontSize: 13, color: Colors.textSecondary, marginTop: 3, fontWeight: '600' },
  examNotes: { fontSize: 12, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  examRight: { alignItems: 'center', gap: 10 },
  daysCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  daysNum: { fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  daysLbl: { fontSize: 10, fontWeight: '800', marginTop: -4, letterSpacing: 0.3 },
  examActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  doneBtn: {},
  doneSection: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginTop: 20, marginBottom: 10, letterSpacing: 0.3 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,10,31,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 22, paddingBottom: 40 },
  modalHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, marginBottom: 16, letterSpacing: -0.4 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginBottom: 8, marginTop: 14, letterSpacing: 0.3 },
  fieldInput: {
    borderWidth: 2, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.textPrimary,
    backgroundColor: Colors.surfaceVariant, fontWeight: '500',
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 2, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: Colors.surfaceVariant,
  },
  dateBtnText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  colorCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  colorSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#0F0A1F', shadowOpacity: 0.22, shadowRadius: 6, elevation: 4 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 26 },
  cancelBtn: { flex: 1, padding: 15, borderRadius: 14, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surfaceVariant },
  saveBtn: { flex: 1, padding: 15, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', ...Shadows.brand },
});

export default ExamCountdownScreen;
