import React, { useState, useEffect } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '../../theme';
import { ResourceType, Faculty, University } from '../../types';
import { ResourcesStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { apiUpload, apiRequest, API_BASE } from '../../utils/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';
import { useFaculties } from '../../hooks/useFaculties';
import { normalizeCurriculumFacultySlug } from '../../utils/normalizeCurriculumFaculty';
import { safeBack } from '../../utils/safeBack';
type Nav = StackNavigationProp<ResourcesStackParamList, 'UploadResource'>;

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  [ResourceType.Note]:         'ملاحظات',
  [ResourceType.PastExam]:     'امتحانات سابقة',
  [ResourceType.Summary]:      'ملخصات',
  [ResourceType.Exercise]:     'تمارين',
  [ResourceType.Project]:      'مشاريع',
  [ResourceType.Presentation]: 'عروض',
  [ResourceType.VideoCourse]:  'فيديو مراجعة 🎬',
};

const YEARS = ['1', '2', '3', '4', '5', '6', '7'];

const UploadResourceScreen = () => {
  const navigation  = useNavigation<Nav>();
  const { token, user } = useAuth();
  const faculties = useFaculties();

  const [titleAr,       setTitleAr]       = useState('');
  const [title,         setTitle]         = useState('');
  const [subject,       setSubject]       = useState('');
  const [description,   setDescription]   = useState('');
  const [tags,          setTags]          = useState('');
  const [faculty,       setFaculty]       = useState<Faculty | null>(
    normalizeCurriculumFacultySlug(user?.faculty as any, (user as any)?.filiere as any) ?? null
  );
  const [resourceType,  setResourceType]  = useState<ResourceType | null>(null);
  const [year,          setYear]          = useState<string | null>(user?.year ? String(user.year) : null);
  const [semester,      setSemester]      = useState<string | null>(null);
  // University is derived from the user (or default). We intentionally don't expose it in the UI
  // because users were confusing it with "faculté" selection.
  const [university] = useState<University>(user?.university ?? University.UNA);
  const [pickedFile,    setPickedFile]    = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [videoUrl,      setVideoUrl]      = useState('');
  const [showSuccess,   setShowSuccess]   = useState(false);

  // ── Subject suggestions fetched from curriculum API ──────────────────────
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    if (!faculty) { setSubjectSuggestions([]); return; }
    setLoadingSuggestions(true);
    const yearParam = year ? `&year=${year}` : '';
    fetch(`${API_BASE}/resources/subjects?faculty=${faculty}${yearParam}`)
      .then(r => r.json())
      .then((data: Array<{ name_ar: string }>) => {
        setSubjectSuggestions(data.map(s => s.name_ar));
      })
      .catch(() => setSubjectSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [faculty, year]);

  const qc = useQueryClient();
  const uploadMutation = useMutation({
    mutationFn: (fd: FormData) => apiUpload('/resources', fd, token),
    onSuccess: () => {
      // Invalidate resource lists + profile XP/badges + home summary
      qc.invalidateQueries({ queryKey: queryKeys.resources.all() });
      qc.invalidateQueries({ queryKey: queryKeys.resources.mySubmissions() });
      qc.invalidateQueries({ queryKey: queryKeys.xp() });
      qc.invalidateQueries({ queryKey: queryKeys.badges() });
      qc.invalidateQueries({ queryKey: queryKeys.home() });
      setShowSuccess(true);
    },
    onError: (e: any) => Alert.alert('فشل الرفع', e.message),
  });

  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        setPickedFile(result.assets[0]);
      }
    } catch (e) {
      Alert.alert('خطأ', 'تعذّر فتح مستعرض الملفات');
    }
  };

  const validate = (): string | null => {
    if (!titleAr.trim())  return 'عنوان المورد (بالعربية) مطلوب';
    if (!subject.trim())  return 'اسم المادة مطلوب';
    if (!faculty)         return 'الكلية مطلوبة';
    if (!resourceType)    return 'نوع المورد مطلوب';
    if (!year)            return 'السنة الدراسية مطلوبة';
    if (!semester)        return 'الفصل الدراسي مطلوب (S1 أو S2)';
    if (resourceType === ResourceType.VideoCourse) {
      if (!videoUrl.trim()) return 'رابط الفيديو مطلوب (YouTube أو Google Drive)';
    } else {
      if (!pickedFile) return 'يرجى اختيار ملف PDF أو DOCX أو PPTX';
    }
    return null;
  };

  const handleSubmit = () => {
    const err = validate();
    if (err) return Alert.alert('خطأ في الإدخال', err);
    if (!token) return Alert.alert('خطأ', 'يرجى تسجيل الدخول أولاً');

    const fd = new FormData();
    fd.append('titleAr',      titleAr.trim());
    fd.append('title',        title.trim() || titleAr.trim());
    fd.append('subject',      subject.trim());
    fd.append('description',  description.trim());
    fd.append('resourceType', resourceType!);
    fd.append('faculty',      faculty!);
    fd.append('university',   university);
    fd.append('year',         year!);
    fd.append('semester',     semester!);
    const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (parsedTags.length) fd.append('tags', JSON.stringify(parsedTags));
    if (resourceType === ResourceType.VideoCourse) {
      fd.append('videoUrl', videoUrl.trim());
    } else {
      fd.append('file', {
        uri:  pickedFile!.uri,
        name: pickedFile!.name,
        type: pickedFile!.mimeType || 'application/octet-stream',
      } as any);
    }

    uploadMutation.mutate(fd);
  };

  const handleReset = () => {
    setTitleAr(''); setTitle(''); setSubject(''); setDescription(''); setTags('');
    setFaculty(normalizeCurriculumFacultySlug(user?.faculty as any, (user as any)?.filiere as any) ?? null);
    setResourceType(null);
    setYear(user?.year ? String(user.year) : null); setSemester(null);
    setPickedFile(null); setVideoUrl('');
    setShowSuccess(false);
  };

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
            <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Resources' } })} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>📤 رفع مورد جديد</Text>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Note banner */}
          <View style={styles.infoBanner}>
            <AppIcon name="shieldCheckmarkOutline" size={20} color="#7C3AED" />
            <Text style={styles.infoText}>سيتم مراجعة المورد من قِبَل فريق الإشراف قبل نشره للطلاب</Text>
          </View>

          {/* Arabic title */}
          <View style={styles.field}>
            <Text style={styles.label}>العنوان (بالعربية) *</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: ملخص الفصل الأول - الرياضيات"
              placeholderTextColor={Colors.textMuted}
              value={titleAr}
              onChangeText={setTitleAr}
              textAlign="right"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              importantForAutofill="no"
            />
          </View>

          {/* French title */}
          <View style={styles.field}>
            <Text style={styles.label}>العنوان (بالفرنسية)</Text>
            <TextInput
              style={styles.input}
              placeholder="Résumé Chapitre 1 - Mathématiques"
              placeholderTextColor={Colors.textMuted}
              value={title}
              onChangeText={setTitle}
              textAlign="left"
              autoCapitalize="sentences"
              autoComplete="off"
              autoCorrect={false}
              importantForAutofill="no"
            />
          </View>

          {/* Subject */}
          <View style={styles.field}>
            <Text style={styles.label}>اسم المادة *</Text>
            {/* Suggestions chips (loaded from curriculum DB) */}
            {loadingSuggestions && (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: 6 }} />
            )}
            {subjectSuggestions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 8 }}
                contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}
              >
                {subjectSuggestions.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.chip,
                      subject === s && styles.chipActive,
                      { paddingHorizontal: 12, paddingVertical: 6 },
                    ]}
                    onPress={() => setSubject(s)}
                  >
                    <Text style={[styles.chipText, subject === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TextInput
              style={styles.input}
              placeholder="مثال: التحليل الرياضي"
              placeholderTextColor={Colors.textMuted}
              value={subject}
              onChangeText={setSubject}
              textAlign="right"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              importantForAutofill="no"
            />
          </View>

          {/* Faculty */}
          <View style={styles.field}>
            <Text style={styles.label}>الكلية *</Text>
            <View style={styles.chipWrap}>
              {faculties.map((f) => (
                <TouchableOpacity
                  key={f.slug}
                  style={[styles.chip, faculty === f.slug && styles.chipActive]}
                  onPress={() => setFaculty(f.slug as Faculty)}
                >
                  <Text style={[styles.chipText, faculty === f.slug && styles.chipTextActive]}>{f.icon} {f.name_ar}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Resource type */}
          <View style={styles.field}>
            <Text style={styles.label}>نوع المورد *</Text>
            <View style={styles.chipWrap}>
              {Object.entries(RESOURCE_TYPE_LABELS).map(([k, v]) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, resourceType === k && styles.chipActive]}
                  onPress={() => setResourceType(k as ResourceType)}
                >
                  <Text style={[styles.chipText, resourceType === k && styles.chipTextActive]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Year */}
          <View style={styles.field}>
            <Text style={styles.label}>السنة الدراسية *</Text>
            <View style={styles.yearRow}>
              {YEARS.map(y => (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearCircle, year === y && styles.yearCircleActive]}
                  onPress={() => setYear(y)}
                >
                  <Text style={[styles.yearText, year === y && styles.yearTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Semester */}
          <View style={styles.field}>
            <Text style={styles.label}>الفصل الدراسي *</Text>
            <View style={styles.chipWrap}>
              {(['1', '2'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, semester === s && styles.chipActive]}
                  onPress={() => setSemester(s)}
                >
                  <Text style={[styles.chipText, semester === s && styles.chipTextActive]}>S{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>وصف (اختياري)</Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              placeholder="صف محتوى الملف بإيجاز..."
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              textAlign="right"
              multiline
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              importantForAutofill="no"
            />
          </View>

          {/* Tags */}
          <View style={styles.field}>
            <Text style={styles.label}>الكلمات المفتاحية (اختياري)</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: رياضيات، تحليل، فصل1 (مفصولة بفاصلة)"
              placeholderTextColor={Colors.textMuted}
              value={tags}
              onChangeText={setTags}
              textAlign="right"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              importantForAutofill="no"
            />
          </View>

          {/* File / Video URL input */}
          {resourceType === ResourceType.VideoCourse ? (
            <View style={styles.field}>
              <Text style={styles.label}>رابط الفيديو (YouTube / Drive) *</Text>
              <View style={styles.videoBanner}>
                <AppIcon name="logoYoutube" size={18} color="#FF0000" />
                <Text style={styles.videoBannerText}>الصق رابط YouTube أو Google Drive هنا</Text>
              </View>
              <TextInput
                style={[styles.input, videoUrl.trim() && { borderColor: '#7C3AED' }]}
                placeholder="https://youtu.be/..."
                placeholderTextColor={Colors.textMuted}
                value={videoUrl}
                onChangeText={setVideoUrl}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                importantForAutofill="no"
                textAlign="left"
              />
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={styles.label}>الملف *</Text>
              <TouchableOpacity style={styles.filePicker} onPress={handleFilePick}>
                <AppIcon
                  name={pickedFile ? 'documentAttach' : 'cloudUploadOutline'}
                  size={26}
                  color="#7C3AED"
                />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={[styles.filePickerText, pickedFile && { color: '#7C3AED', fontWeight: '700' }]}
                    numberOfLines={1}>
                    {pickedFile ? pickedFile.name : 'اختر ملفًا (PDF, DOCX, PPTX…)'}
                  </Text>
                  {pickedFile?.size && (
                    <Text style={styles.fileSizeText}>
                      {(pickedFile.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  )}
                </View>
                {pickedFile && (
                  <TouchableOpacity onPress={() => setPickedFile(null)}>
                    <AppIcon name="closeCircle" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <AppIcon name='send' size={18} color="#fff" />
                <Text style={styles.submitText}>إرسال للمراجعة</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pending-approval modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <AppIcon name='time' size={56} color="#D97706" />
            </View>
            <Text style={styles.successTitle}>في انتظار المراجعة</Text>
            <Text style={styles.successBody}>
              تم إرسال مستندك بنجاح. سيتم مراجعته من قِبل الإدارة ونشره خلال 24–48 ساعة.
            </Text>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => {
                handleReset();
                setShowSuccess(false);
                navigation.navigate('MySubmissions');
              }}
            >
              <Text style={styles.successBtnText}>عرض مشاركاتي</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.successBtnSecondary}
              onPress={() => { handleReset(); safeBack(navigation as any, { name: 'Explore', params: { screen: 'Resources' } }); }}
            >
              <Text style={styles.successBtnSecondaryText}>العودة للمكتبة</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: 10 },
  headerTitle: { fontSize: 19, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: Spacing.lg, gap: 4, paddingBottom: 120 },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EDE9FE', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: 8,
  },
  infoText: { flex: 1, fontSize: 13, color: '#5B21B6', textAlign: 'right', lineHeight: 20 },
  field: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 7 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 11, fontSize: 15,
    color: Colors.textPrimary, backgroundColor: '#fff', ...Shadows.xs,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' },
  chipText: { fontSize: 13, color: Colors.textMuted },
  chipTextActive: { color: '#7C3AED', fontWeight: '700' },
  yearRow: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  yearCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  yearCircleActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  yearText: { fontSize: 16, fontWeight: '700', color: Colors.textMuted },
  yearTextActive: { color: '#fff' },
  filePicker: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 2, borderColor: '#EDE9FE', borderRadius: BorderRadius.lg, borderStyle: 'dashed',
    paddingVertical: 18, paddingHorizontal: 16, backgroundColor: '#FAFAFA',
  },
  filePickerText: { fontSize: 14, color: Colors.textMuted, textAlign: 'right' },
  fileSizeText: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  videoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF1F2', borderRadius: BorderRadius.sm, padding: 10, marginBottom: 8,
  },
  videoBannerText: { fontSize: 12, color: '#BE123C', flex: 1, textAlign: 'right' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7C3AED', borderRadius: BorderRadius.lg, paddingVertical: 14, marginTop: 8,
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  successCard: { backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', marginHorizontal: 32, gap: 12 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  successBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  successBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 40, paddingVertical: 12, borderRadius: BorderRadius.full, marginTop: 8, width: '100%', alignItems: 'center' },
  successBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  successBtnSecondary: { paddingVertical: 10, width: '100%', alignItems: 'center' },
  successBtnSecondaryText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
});

export default UploadResourceScreen;

