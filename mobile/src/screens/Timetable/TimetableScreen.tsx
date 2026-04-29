import React, { useState, useCallback, useMemo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, KeyboardAvoidingView, Platform, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { DayOfWeek } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { scheduleCourseReminder, cancelCourseReminder, requestNotificationPermissions } from '../../utils/notifications';
import * as ImagePicker from 'expo-image-picker';
import { safeBack } from '../../utils/safeBack';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';

import { apiRequest } from '../../utils/api';

// Map JS getDay() (0=Sun) to DayOfWeek enum (0=Sun) — already aligned
const todayDow = (): DayOfWeek => new Date().getDay() as DayOfWeek;

const DAYS: { key: DayOfWeek; ar: string; fr: string; en: string }[] = [
  { key: DayOfWeek.Sunday,    ar: 'أحد',   fr: 'Dim', en: 'Sun' },
  { key: DayOfWeek.Monday,    ar: 'اثنين', fr: 'Lun', en: 'Mon' },
  { key: DayOfWeek.Tuesday,   ar: 'ثلاثاء', fr: 'Mar', en: 'Tue' },
  { key: DayOfWeek.Wednesday, ar: 'أربعاء', fr: 'Mer', en: 'Wed' },
  { key: DayOfWeek.Thursday,  ar: 'خميس', fr: 'Jeu', en: 'Thu' },
  { key: DayOfWeek.Friday,    ar: 'جمعة',  fr: 'Ven', en: 'Fri' },
  { key: DayOfWeek.Saturday,  ar: 'سبت',   fr: 'Sam', en: 'Sat' },
];

const TIMES: string[] = [];
for (let h = 7; h <= 21; h++) {
  TIMES.push(`${h.toString().padStart(2, '0')}:00`);
  if (h < 21) TIMES.push(`${h.toString().padStart(2, '0')}:30`);
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#6B7280'];

const emptyForm = {
  nameAr: '',
  name: '',
  teacher: '',
  room: '',
  color: COLORS[0],
  dayOfWeek: DayOfWeek.Sunday,
  startTime: '08:00',
  endTime: '10:00',
};

type FormState = typeof emptyForm;

const TimetableScreen = () => {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isAr = lang === 'ar';
  const navigation = useNavigation();
  const [courses, setCourses] = useState<any[]>([]);
  const [activeDay, setActiveDay] = useState<DayOfWeek>(todayDow());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [timeMode, setTimeMode] = useState<'start' | 'end'>('start');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [ocrScanning, setOcrScanning] = useState(false);

  const fetchCourses = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await apiRequest<any[]>('/timetable', { token });
      // Normalize snake_case API response to camelCase
      setCourses(rows.map((r: any) => ({
          id: r.id,
          nameAr: r.name_ar,
          name: r.name || '',
          teacher: r.teacher || '',
          room: r.room || '',
          color: r.color,
          dayOfWeek: r.day_of_week,
          startTime: r.start_time,
          endTime: r.end_time,
        })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      fetchCourses();
    }, [fetchCourses])
  );

  const openAdd = () => {
    setForm({ ...emptyForm, dayOfWeek: activeDay });
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (c: any) => {
    setForm({ nameAr: c.nameAr, name: c.name, teacher: c.teacher || '', room: c.room || '', color: c.color, dayOfWeek: c.dayOfWeek, startTime: c.startTime, endTime: c.endTime });
    setEditId(c.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nameAr.trim()) return Alert.alert(t('common.error'), t('tt.error_name'));

    // Validate start < end
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    if (toMin(form.startTime) >= toMin(form.endTime)) {
      Alert.alert(
        t('common.error'),
        isAr ? 'وقت الانتهاء يجب أن يكون بعد وقت البداية' : "L'heure de fin doit être après l'heure de début"
      );
      return;
    }

    // Conflict detection: check against other courses on the same day
    const conflictCourse = courses.find(c => {
      if (c.dayOfWeek !== form.dayOfWeek) return false;
      if (c.id === editId) return false; // skip the course being edited
      const cStart = toMin(c.startTime);
      const cEnd   = toMin(c.endTime);
      const nStart = toMin(form.startTime);
      const nEnd   = toMin(form.endTime);
      return nStart < cEnd && nEnd > cStart; // overlap condition
    });

    const doSave = async () => {
      setSaving(true);
      try {
        const body = { nameAr: form.nameAr, name: form.name, teacher: form.teacher, room: form.room, color: form.color, dayOfWeek: form.dayOfWeek, startTime: form.startTime, endTime: form.endTime };
        if (editId) {
          await apiRequest(`/timetable/${editId}`, { method: 'PUT', token, body });
          // Update reminder for edited course
          await cancelCourseReminder(editId);
          await scheduleCourseReminder({ id: editId, nameAr: form.nameAr, room: form.room, dayOfWeek: form.dayOfWeek, startTime: form.startTime }).catch(() => {});
        } else {
          const created = await apiRequest<{ id: string }>('/timetable', { method: 'POST', token, body });
          // Ask for reminder on new course
          const granted = await requestNotificationPermissions();
          if (granted && created?.id) {
            Alert.alert(
              isAr ? '🔔 تذكير تلقائي' : '🔔 Rappel automatique',
              isAr
                ? `تفعيل تذكير أسبوعي قبل 15 دقيقة من "${form.nameAr}"؟`
                : `Activer un rappel chaque semaine 15 min avant "${form.nameAr}" ?`,
              [
                { text: isAr ? 'لا' : 'Non', style: 'cancel' },
                {
                  text: isAr ? 'نعم' : 'Oui',
                  onPress: () => scheduleCourseReminder({ id: created.id, nameAr: form.nameAr, room: form.room, dayOfWeek: form.dayOfWeek, startTime: form.startTime }).catch(() => {}),
                },
              ]
            );
          }
        }
        setShowModal(false);
        fetchCourses();
      } catch (e: any) { Alert.alert(t('common.error'), e.message); }
      finally { setSaving(false); }
    };

    if (conflictCourse) {
      Alert.alert(
        isAr ? '⚠️ تعارض في الجدول' : '⚠️ Conflit de planning',
        isAr
          ? `يتعارض مع "${conflictCourse.nameAr}" (${conflictCourse.startTime}–${conflictCourse.endTime})\nهل تريد المتابعة رغم ذلك؟`
          : `Conflit avec "${conflictCourse.nameAr}" (${conflictCourse.startTime}–${conflictCourse.endTime})\nContinuer quand même?`,
        [
          { text: isAr ? 'إلغاء' : 'Annuler', style: 'cancel' },
          { text: isAr ? 'متابعة رغم ذلك' : 'Continuer', style: 'destructive', onPress: doSave },
        ]
      );
      return;
    }

    await doSave();
  };

  const handleDelete = (id: string) => {
    Alert.alert(t('tt.delete_title'), t('tt.delete_msg'), [
      { text: t('tt.delete_cancel'), style: 'cancel' },
      { text: t('tt.delete_confirm'), style: 'destructive', onPress: async () => {
        try {
          await apiRequest(`/timetable/${id}`, { method: 'DELETE', token });
          cancelCourseReminder(id).catch(() => {}); // remove weekly notification
        } catch {}
        fetchCourses();
      }},
    ]);
  };

  const openTimePicker = (mode: 'start' | 'end') => {
    setTimeMode(mode);
    setShowTimePicker(true);
  };

  const handleOcrImport = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (!cam.granted) {
          Alert.alert(isAr ? 'تعذّر الوصول' : 'Permission refusée', isAr ? 'يرجى السماح بالوصول إلى الصور أو الكاميرا' : 'Autorisez l\'accès aux photos ou à la caméra');
          return;
        }
      }
      Alert.alert(
        isAr ? '📷 استيراد الجدول' : '📷 Importer l\'emploi du temps',
        isAr ? 'اختر مصدر الصورة' : 'Choisir la source',
        [
          { text: isAr ? 'المعرض' : 'Galerie', onPress: async () => {
            const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
            if (!res.canceled && res.assets[0]?.base64) await doOcrImport(res.assets[0].base64);
          }},
          { text: isAr ? 'الكاميرا' : 'Appareil photo', onPress: async () => {
            const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
            if (!res.canceled && res.assets[0]?.base64) await doOcrImport(res.assets[0].base64);
          }},
          { text: isAr ? 'إلغاء' : 'Annuler', style: 'cancel' },
        ]
      );
    } catch (e) {
      Alert.alert(isAr ? 'خطأ' : 'Erreur', String(e));
    }
  };

  const doOcrImport = async (base64: string) => {
    setOcrScanning(true);
    try {
      const result = await apiRequest<{ courses: any[]; count: number }>('/ai/timetable-ocr', {
        method: 'POST', token,
        body: { imageBase64: base64 },
      });
      if (!result?.courses?.length) {
        Alert.alert(isAr ? 'لم يُعثر على نتائج' : 'Aucun résultat', isAr ? 'تعذّر استخراج الجدول من هذه الصورة' : 'Impossible d\'extraire l\'emploi du temps depuis cette image');
        return;
      }
      // Insert all extracted courses
      let inserted = 0;
      for (const c of result.courses) {
        try {
          await apiRequest('/timetable', { method: 'POST', token, body: c });
          inserted++;
        } catch (_) {}
      }
      Alert.alert(
        isAr ? '✅ تم الاستيراد' : '✅ Import réussi',
        isAr ? `تم إضافة ${inserted} من ${result.courses.length} حصة إلى جدولك` : `${inserted} sur ${result.courses.length} cours ajoutés à ton emploi du temps`,
      );
      fetchCourses();
    } catch (e: any) {
      Alert.alert(isAr ? 'خطأ في الاستيراد' : 'Erreur d\'import', e?.message ?? String(e));
    } finally {
      setOcrScanning(false);
    }
  };

  const dayCoursesAll = DAYS.map(d => ({
    ...d,
    courses: courses.filter(c => c.dayOfWeek === d.key).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));

  const activeCourses = dayCoursesAll.find(d => d.key === activeDay)?.courses ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <LinearGradient
        colors={['#6366F1', '#0EA5E9', '#06B6D4']}
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
            <View>
              <Text style={styles.headerTitle}>{t('tt.title')}</Text>
              <Text style={styles.headerSub}>{courses.length}{t('tt.courses_count')}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.75}>
                <AppIcon name='add' size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.ocrBtn} onPress={handleOcrImport} disabled={ocrScanning} activeOpacity={0.75}>
                {ocrScanning
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <AppIcon name="cameraOutline" size={20} color="#fff" />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Day selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
            {DAYS.map(d => {
              const count = courses.filter(c => c.dayOfWeek === d.key).length;
              const active = activeDay === d.key;
              return (
                <TouchableOpacity key={d.key} style={[styles.dayBtn, active && styles.dayBtnActive]} onPress={() => setActiveDay(d.key)}>
                  <Text style={[styles.dayAr, active && styles.dayTextActive]}>{lang === 'fr' ? d.fr : d.ar}</Text>
                  {count > 0 && (
                    <View style={[styles.dayCount, active && styles.dayCountActive]}>
                      <Text style={[styles.dayCountText, active && { color: '#2563EB' }]}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      {/* Course list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#2563EB" size="large" />
      ) : activeCourses.length === 0 ? (
        <View style={styles.empty}>
          <AppIcon name="calendarOutline" size={60} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>{t('tt.empty')}</Text>
          <TouchableOpacity style={styles.emptyAdd} onPress={openAdd}>
            <AppIcon name="addCircle" size={18} color="#fff" />
            <Text style={styles.emptyAddText}>{t('tt.add_course')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={activeCourses}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCourses(); }} />}
          renderItem={({ item }) => (
            <View style={[styles.courseCard, { borderLeftColor: item.color, borderLeftWidth: 4 }]}>
              <View style={styles.timeCol}>
                <Text style={styles.timeText}>{item.startTime}</Text>
                <View style={[styles.timeLine, { backgroundColor: item.color + '40' }]} />
                <Text style={styles.timeText}>{item.endTime}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.courseName}>{item.nameAr}</Text>
                {item.name ? <Text style={styles.courseNameFr}>{item.name}</Text> : null}
                <View style={styles.courseMeta}>
                  {item.teacher ? (
                    <View style={styles.metaItem}>
                      <AppIcon name="personOutline" size={12} color={Colors.textMuted} />
                      <Text style={styles.metaText}>{item.teacher}</Text>
                    </View>
                  ) : null}
                  {item.room ? (
                    <View style={styles.metaItem}>
                      <AppIcon name="locationOutline" size={12} color={Colors.textMuted} />
                      <Text style={styles.metaText}>{item.room}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
                  <AppIcon name="pencilOutline" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                  <AppIcon name="trashOutline" size={16} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Week overview strip */}
      {courses.length > 0 && (
        <View style={styles.weekStrip}>
          {DAYS.map(d => {
            const count = courses.filter(c => c.dayOfWeek === d.key).length;
            return (
              <TouchableOpacity key={d.key} style={styles.stripDay} onPress={() => setActiveDay(d.key)}>
                <Text style={[styles.stripLabel, d.key === activeDay && { color: '#2563EB', fontWeight: '700' }]}>{d.en}</Text>
                <View style={styles.stripDots}>
                  {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                    <View key={i} style={[styles.stripDot, d.key === activeDay && { backgroundColor: '#2563EB' }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>{t('tt.modal.cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editId ? t('tt.modal.edit') : t('tt.modal.new')}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#2563EB" size="small" />
                  : <Text style={styles.saveText}>{t('tt.modal.save')}</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Arabic name */}
              <Text style={styles.formLabel}>{t('tt.field.name_ar')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('tt.field.name_ar_placeholder')}
                placeholderTextColor={Colors.textMuted}
                value={form.nameAr}
                onChangeText={v => setForm(f => ({ ...f, nameAr: v }))}
                textAlign="right"
                autoCapitalize="none"
              />

              {/* French name */}
              <Text style={styles.formLabel}>{t('tt.field.name_fr')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Analyse Mathématique"
                placeholderTextColor={Colors.textMuted}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                textAlign="left"
                autoCapitalize="words"
              />

              {/* Teacher */}
              <Text style={styles.formLabel}>{t('tt.field.teacher')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('tt.field.teacher_placeholder')}
                placeholderTextColor={Colors.textMuted}
                value={form.teacher}
                onChangeText={v => setForm(f => ({ ...f, teacher: v }))}
                textAlign="right"
                autoCapitalize="words"
              />

              {/* Room */}
              <Text style={styles.formLabel}>{t('tt.field.room')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('tt.field.room_placeholder')}
                placeholderTextColor={Colors.textMuted}
                value={form.room}
                onChangeText={v => setForm(f => ({ ...f, room: v }))}
                textAlign="right"
                autoCapitalize="characters"
              />

              {/* Day picker */}
              <Text style={styles.formLabel}>{t('tt.field.day')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                {DAYS.map(d => (
                  <TouchableOpacity
                    key={d.key}
                    style={[styles.dayChip, form.dayOfWeek === d.key && styles.dayChipActive]}
                    onPress={() => setForm(f => ({ ...f, dayOfWeek: d.key }))}
                  >
                    <Text style={[styles.dayChipText, form.dayOfWeek === d.key && styles.dayChipTextActive]}>{lang === 'fr' ? d.fr : d.ar}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Time pickers */}
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>{t('tt.field.end_time')}</Text>
                  <TouchableOpacity style={styles.timePicker} onPress={() => openTimePicker('end')}>
                    <AppIcon name="timeOutline" size={16} color="#2563EB" />
                    <Text style={styles.timePickerText}>{form.endTime}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>{t('tt.field.start_time')}</Text>
                  <TouchableOpacity style={styles.timePicker} onPress={() => openTimePicker('start')}>
                    <AppIcon name="timeOutline" size={16} color="#2563EB" />
                    <Text style={styles.timePickerText}>{form.startTime}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Color picker */}
              <Text style={styles.formLabel}>{t('tt.field.color')}</Text>
              <View style={styles.colorsRow}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, form.color === c && styles.colorDotActive]}
                    onPress={() => setForm(f => ({ ...f, color: c }))}
                  >
                    {form.color === c && <AppIcon name='checkmark' size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Time picker modal */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <View style={styles.tpOverlay}>
          <View style={styles.tpSheet}>
            <View style={styles.tpHeader}>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.cancelText}>{t('tt.time.close')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{timeMode === 'start' ? t('tt.time.start') : t('tt.time.end')}</Text>
              <View style={{ width: 60 }} />
            </View>
            <FlatList
              data={TIMES}
              keyExtractor={t => t}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => {
                const selected = timeMode === 'start' ? form.startTime === item : form.endTime === item;
                return (
                  <TouchableOpacity
                    style={[styles.tpItem, selected && styles.tpItemActive]}
                    onPress={() => {
                      setForm(f => timeMode === 'start' ? { ...f, startTime: item } : { ...f, endTime: item });
                      setShowTimePicker(false);
                    }}
                  >
                    <Text style={[styles.tpItemText, selected && styles.tpItemTextActive]}>{item}</Text>
                    {selected && <AppIcon name='checkmark' size={18} color="#2563EB" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  header: { paddingBottom: 14, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: 10, paddingBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'right', letterSpacing: -0.4 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.92)', textAlign: 'right', fontWeight: '700', marginTop: 2 },
  backBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  ocrBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  daysRow: { paddingHorizontal: Spacing.lg, gap: 8, paddingBottom: 10 },
  dayBtn: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)',
    alignItems: 'center', minWidth: 58,
  },
  dayBtnActive: {
    backgroundColor: '#fff', borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  dayAr: { fontSize: 13, fontWeight: '800', color: '#fff' },
  dayTextActive: { color: '#6366F1' },
  dayCount: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  dayCountActive: { backgroundColor: '#E0E7FF' },
  dayCountText: { fontSize: 10, color: '#fff', fontWeight: '800' },
  listContent: { padding: Spacing.lg, gap: 10, paddingBottom: 100 },
  courseCard: {
    backgroundColor: C.surface, borderRadius: BorderRadius['2xl'],
    padding: Spacing.base, flexDirection: 'row', gap: 12,
    ...Shadows.sm,
    borderWidth: 1, borderColor: C.borderLight,
  },
  timeCol: { alignItems: 'center', gap: 4, paddingTop: 2 },
  timeText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  timeLine: { width: 2, flex: 1, borderRadius: 1, minHeight: 16 },
  courseName: { fontSize: 15, fontWeight: '700', color: C.textPrimary, textAlign: 'right' },
  courseNameFr: { fontSize: 12, color: C.textMuted, textAlign: 'right', marginTop: 1 },
  courseMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, justifyContent: 'flex-end' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: C.textMuted },
  cardActions: { gap: 8, alignItems: 'center' },
  actionBtn: { padding: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 17, color: C.textSecondary, fontWeight: '600' },
  emptyAdd: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6366F1', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, marginTop: 4, shadowColor: '#6366F1', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  emptyAddText: { color: '#fff', fontWeight: '800', letterSpacing: 0.3 },
  weekStrip: { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 8, paddingHorizontal: Spacing.sm },
  stripDay: { flex: 1, alignItems: 'center', gap: 4 },
  stripLabel: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  stripDots: { flexDirection: 'row', gap: 2, flexWrap: 'wrap', justifyContent: 'center' },
  stripDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: C.textPrimary },
  cancelText: { fontSize: 15, color: Colors.error },
  saveText: { fontSize: 15, fontWeight: '700', color: '#2563EB' },
  modalBody: { padding: Spacing.lg },
  formLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, textAlign: 'right', marginBottom: 6, marginTop: 12 },
  formInput: { borderWidth: 1.5, borderColor: C.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 11, fontSize: 15, color: C.textPrimary, backgroundColor: C.surfaceWarm },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  dayChipActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  dayChipText: { fontSize: 13, color: C.textMuted },
  dayChipTextActive: { color: '#2563EB', fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 12 },
  timePicker: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#EFF6FF', borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#F8FAFF', justifyContent: 'center' },
  timePickerText: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
  colorsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  colorDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'transparent' },
  colorDotActive: { borderColor: C.textPrimary, transform: [{ scale: 1.1 }] },
  tpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  tpSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%' },
  tpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: C.border },
  tpItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: C.borderLight },
  tpItemActive: { backgroundColor: '#EFF6FF' },
  tpItemText: { fontSize: 18, color: C.textPrimary, fontWeight: '500' },
  tpItemTextActive: { color: '#2563EB', fontWeight: '700' },
});

export default TimetableScreen;
