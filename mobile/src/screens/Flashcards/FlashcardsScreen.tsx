import React, { useCallback, useState, useMemo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { FlashcardsStackParamList, FlashcardDeck } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, BorderRadius, Shadows, Gradients } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useAccessibility } from '../../context/AccessibilityContext';

import { apiRequest } from '../../utils/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';
import {
  cacheDecks, getCachedDecks,
  getPendingReviews, setPendingReviews,
  timeAgoAr,
} from '../../utils/offlineStorage';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { OfflineBanner } from '../../components/common/OfflineBanner';
import { Colors } from '../../theme';
import { safeBack } from '../../utils/safeBack';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';
type Nav = StackNavigationProp<FlashcardsStackParamList, 'FlashcardsList'>;

const mapDeck = (d: any): FlashcardDeck => ({
  id: d.id,
  userId: d.user_id,
  title: d.title,
  subject: d.subject,
  color: d.color || '#8B5CF6',
  cardCount: d.card_count ?? 0,
  dueCount: d.due_count ?? 0,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

const ACCENT = '#06B6D4'; // cyan-500 (module: flashcards)
const ACCENT_DARK = '#0891B2';

const makeStyles = (C: typeof import('../../theme').Colors, fs: (n: number) => number = n => n) => StyleSheet.create({
  header: { paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: 10 },
  headerTitle: { fontSize: fs(24), fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerSub: { fontSize: fs(12), color: 'rgba(255,255,255,0.92)', marginTop: 3, fontWeight: '700' },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  deckCard: {
    backgroundColor: C.surface, borderRadius: BorderRadius['2xl'],
    padding: Spacing.base,
    ...Shadows.sm,
    borderWidth: 1, borderColor: C.borderLight,
  },
  deckTop: { flexDirection: 'row', alignItems: 'center' },
  deckIconWrap: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  deckTitle: { fontSize: fs(15), fontWeight: '700', color: C.textPrimary, textAlign: 'right' },
  deckSubject: { fontSize: fs(12), color: C.textMuted, marginTop: 2, textAlign: 'right' },
  menuBtn: { marginLeft: 6 },
  deckStats: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceVariant, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  duePill: { backgroundColor: ACCENT },
  donePill: { backgroundColor: '#ECFDF5' },
  statText: { fontSize: fs(12), color: C.textMuted, fontWeight: '600' },
  studyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  studyBtnText: { fontSize: fs(12), color: '#fff', fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: fs(20), fontWeight: '800', color: C.textPrimary },
  emptyText: { fontSize: fs(14), color: C.textMuted, textAlign: 'center', lineHeight: 22 },
  createFirstBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ACCENT, borderRadius: BorderRadius.lg, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  createFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: fs(15) },
  quizBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: ACCENT, borderRadius: 16, padding: 14, marginBottom: 12 },
  quizBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quizBannerIcon: { fontSize: 28 },
  quizBannerTitle: { fontSize: fs(15), fontWeight: '800', color: '#fff' },
  quizBannerSub: { fontSize: fs(12), color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  syncToast: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 6 },
  syncToastText: { color: '#fff', fontSize: fs(12), fontWeight: '600' },
  importBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: fs(17), fontWeight: '800', color: C.textPrimary },
  modalHint: { fontSize: fs(12), color: C.textMuted, lineHeight: 18, textAlign: 'right', marginBottom: 16, backgroundColor: C.surfaceVariant, padding: 10, borderRadius: 10 },
  fieldLabel: { fontSize: fs(13), fontWeight: '700', color: C.textSecondary, textAlign: 'right', marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), color: C.textPrimary, marginBottom: 14 },
  importConfirmBtn: { backgroundColor: ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  importConfirmText: { color: '#fff', fontWeight: '700', fontSize: fs(15) },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
});

const DeckCard = ({
  deck,
  onStudy,
  onEdit,
  onDelete,
}: {
  deck: FlashcardDeck;
  onStudy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const { t, lang } = useLanguage();
  const { colors: C } = useTheme();
  const { fontSize } = useAccessibility();
  const styles = useMemo(() => makeStyles(C, fontSize), [C, fontSize]);
  const hasDue = deck.dueCount > 0;
  // Exam-ready prediction: ~15 cards/day conservative daily rate
  const examDays = hasDue ? Math.ceil(deck.dueCount / 15) : 0;
  return (
    <TouchableOpacity
      style={[styles.deckCard, { borderLeftColor: deck.color, borderLeftWidth: 4 }]}
      onPress={onStudy}
      activeOpacity={0.85}
    >
      <View style={styles.deckTop}>
        <View style={[styles.deckIconWrap, { backgroundColor: deck.color + '22' }]}>
          <AppIcon name='albums' size={22} color={deck.color} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.deckTitle} numberOfLines={1}>{deck.title}</Text>
          {deck.subject ? (
            <Text style={styles.deckSubject} numberOfLines={1}>{deck.subject}</Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={onEdit} style={styles.menuBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <AppIcon name="createOutline" size={18} color="#9CA3AF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.menuBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <AppIcon name="trashOutline" size={18} color="#F87171" />
        </TouchableOpacity>
      </View>

      <View style={styles.deckStats}>
        <View style={styles.statPill}>
          <AppIcon name="copyOutline" size={13} color="#6B7280" />
          <Text style={styles.statText}>{deck.cardCount}{t('flash.cards_count')}</Text>
        </View>
        {hasDue ? (
          <View style={[styles.statPill, styles.duePill]}>
            <AppIcon name='time' size={13} color="#fff" />
            <Text style={[styles.statText, { color: '#fff' }]}>{deck.dueCount}{t('flash.due_count')}</Text>
          </View>
        ) : (
          <View style={[styles.statPill, styles.donePill]}>
            <AppIcon name="checkmarkCircle" size={13} color="#10B981" />
            <Text style={[styles.statText, { color: '#10B981' }]}>{t('flash.done_today')}</Text>
          </View>
        )}
        {hasDue && (
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <View style={[styles.studyBtn, { backgroundColor: deck.color }]}>
              <Text style={styles.studyBtnText}>{t('flash.start_review')}</Text>
              <AppIcon name="arrowBack" size={14} color="#fff" />
            </View>
          </View>
        )}
      </View>

      {/* Exam-Ready Prediction (Anki-style) */}
      {hasDue && (
        <View style={{ flexDirection: lang === 'ar' ? 'row-reverse' : 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <AppIcon name="schoolOutline" size={12} color="#F59E0B" />
          <Text style={{ fontSize: fontSize(11), color: '#F59E0B', fontWeight: '700' }}>
            {lang === 'ar'
              ? `🎓 جاهز للامتحان خلال ~${examDays} ${examDays === 1 ? 'يوم' : 'أيام'}`
              : `🎓 Prêt en ~${examDays} j`}
          </Text>
        </View>
      )}
      {!hasDue && deck.cardCount > 0 && (
        <View style={{ flexDirection: lang === 'ar' ? 'row-reverse' : 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <AppIcon name="trophyOutline" size={12} color="#10B981" />
          <Text style={{ fontSize: fontSize(11), color: '#10B981', fontWeight: '700' }}>
            {lang === 'ar' ? '✅ متقن اليوم' : '✅ Maîtrisé aujourd\'hui'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

export default function FlashcardsScreen() {
  const navigation = useNavigation<Nav>();
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const { fontSize } = useAccessibility();
  const styles = useMemo(() => makeStyles(C, fontSize), [C, fontSize]);
  const qc = useQueryClient();
  const { isOnline } = useNetworkStatus();
  const [offlineCachedAt, setOfflineCachedAt] = React.useState<number | null>(null);
  const [syncCount, setSyncCount] = React.useState(0);
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

  // ── CSV Import state ──────────────────────────────────────────────────────
  const [csvModalVisible, setCsvModalVisible] = useState(false);
  const [csvDeckName,     setCsvDeckName]     = useState('');
  const [csvSubject,      setCsvSubject]      = useState('');
  const [csvImporting,    setCsvImporting]    = useState(false);

  const parseCSV = (text: string): { front: string; back: string }[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const pairs: { front: string; back: string }[] = [];
    for (const line of lines) {
      // Support comma or semicolon or tab as delimiter
      const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      const idx = line.indexOf(sep);
      if (idx < 1) continue;
      const front = line.slice(0, idx).replace(/^"|"$/g, '').trim();
      const back  = line.slice(idx + 1).replace(/^"|"$/g, '').trim();
      if (front && back) pairs.push({ front, back });
    }
    return pairs;
  };

  const handleCSVImport = async () => {
    if (!csvDeckName.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم المجموعة'); return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets.length) return;

      setCsvImporting(true);
      const asset = result.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'utf8' });
      const pairs = parseCSV(content);

      if (pairs.length === 0) {
        Alert.alert('ملف فارغ', 'لم يتم العثور على أزواج صالحة — تأكد من أن الملف بصيغة: سؤال,جواب');
        setCsvImporting(false); return;
      }
      if (pairs.length > 500) {
        Alert.alert('ملف كبير جداً', `الحد الأقصى 500 بطاقة. وُجدت ${pairs.length} — يُنصح بتقسيم الملف.`);
        setCsvImporting(false); return;
      }

      // 1. Create deck
      const deck = await apiRequest<{ id: string }>('/flashcards/decks', {
        method: 'POST',
        token: token!,
        body: { title: csvDeckName.trim(), subject: csvSubject.trim() || undefined, color: '#8B5CF6' },
      });
      if (!deck?.id) throw new Error('فشل إنشاء المجموعة');

      // 2. Batch-create cards sequentially (avoid overloading server)
      let created = 0;
      for (const pair of pairs) {
        await apiRequest(`/flashcards/decks/${deck.id}/cards`, {
          method: 'POST', token: token!,
          body: { front: pair.front, back: pair.back },
        });
        created++;
      }

      setCsvModalVisible(false);
      setCsvDeckName(''); setCsvSubject('');
      qc.invalidateQueries({ queryKey: queryKeys.flashcards.decks() });
      qc.invalidateQueries({ queryKey: queryKeys.flashcards.summary() });
      Alert.alert('✅ تم الاستيراد', `تم إنشاء مجموعة "${csvDeckName.trim()}" بـ ${created} بطاقة`);
    } catch (e: any) {
      Alert.alert('خطأ في الاستيراد', e.message);
    } finally {
      setCsvImporting(false);
    }
  };

  const { data: decks = [], isLoading: loading, refetch: refetchDecks } = useQuery({
    queryKey: queryKeys.flashcards.decks(),
    queryFn: async () => {
      try {
        const data = await apiRequest<any[]>('/flashcards/decks', { token: token! });
        const mapped = (Array.isArray(data) ? data : []).map(mapDeck);
        cacheDecks(mapped); // fire-and-forget
        setOfflineCachedAt(null);
        return mapped;
      } catch {
        // Network error — fall back to cached decks
        const cached = await getCachedDecks();
        if (cached) {
          setOfflineCachedAt(cached.cachedAt);
          return cached.decks;
        }
        return [] as FlashcardDeck[];
      }
    },
    enabled: !!token,
    staleTime: 30_000,
    retry: false,
  });

  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: queryKeys.flashcards.summary(),
    queryFn: async () => {
      try {
        return await apiRequest<{ totalDue: number }>('/flashcards/summary', { token: token! });
      } catch {
        return { totalDue: 0 };
      }
    },
    enabled: !!token,
    retry: false,
  });

  const totalDue = summaryData?.totalDue ?? 0;

  useFocusEffect(useCallback(() => {
    refetchDecks();
    refetchSummary();
  }, [refetchDecks, refetchSummary]));

  // ── Sync pending offline reviews when reconnected ────────────────────────
  React.useEffect(() => {
    if (!isOnline || !token) return;
    let cancelled = false;
    (async () => {
      const queue = await getPendingReviews();
      if (queue.length === 0) return;
      const remaining = [];
      for (const review of queue) {
        try {
          await apiRequest(`/flashcards/cards/${review.cardId}/review`, {
            method: 'POST', token, body: { quality: review.quality },
          });
        } catch {
          remaining.push(review);
        }
      }
      await setPendingReviews(remaining);
      const synced = queue.length - remaining.length;
      if (!cancelled && synced > 0) {
        setSyncCount(synced);
        refetchDecks();
        refetchSummary();
      }
    })();
    return () => { cancelled = true; };
  }, [isOnline, token]);

  const deleteMutation = useMutation({
    mutationFn: (deckId: string) => apiRequest(`/flashcards/decks/${deckId}`, { method: 'DELETE', token: token! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.flashcards.decks() });
      qc.invalidateQueries({ queryKey: queryKeys.flashcards.summary() });
    },
  });

  const deleteDeck = (deck: FlashcardDeck) => {
    Alert.alert(
      t('flash.delete_title'),
      `${t('flash.delete_msg').replace('?', '')} "${deck.title}"?`,
      [
        { text: t('flash.delete_cancel'), style: 'cancel' },
        { text: t('flash.delete_confirm'), style: 'destructive', onPress: () => deleteMutation.mutate(deck.id) },
      ],
    );
  };

  const startQuickQuiz = () => {
    // Pick the deck with the most cards (or most due cards)
    const eligible = decks.filter(d => d.cardCount > 0);
    if (eligible.length === 0) {
      Alert.alert('⚡ مسابقة سريعة', 'لا توجد بطاقات بعد — أنشئ مجموعة أولاً!'); return;
    }
    const deck = eligible.reduce((best, d) =>
      (d.dueCount > best.dueCount ? d : best), eligible[0]);
    navigation.navigate('StudySession', {
      deckId: deck.id,
      deckTitle: deck.title,
      deckColor: deck.color,
      quizMode: true,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle="light-content" backgroundColor={ACCENT} />

      {/* Header */}
      <LinearGradient
        colors={['#06B6D4', '#0EA5E9', '#6366F1']}
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
              <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={18} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>{t('flash.title')}</Text>
              {totalDue > 0 && (
                <Text style={styles.headerSub}>{totalDue}{t('flash.due_today')}</Text>
              )}
              {totalDue === 0 && decks.length > 0 && (
                <Text style={styles.headerSub}>{t('flash.all_done')}</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={styles.importBtn}
                onPress={() => (navigation as any).navigate('Pomodoro')}
              >
                <Text style={{ fontSize: 16 }}>🍅</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.importBtn}
                onPress={() => (navigation as any).navigate('ScanCreate')}
              >
                <AppIcon name="cameraOutline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.importBtn}
                onPress={() => setCsvModalVisible(true)}
              >
                <AppIcon name="documentTextOutline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('CreateDeck', undefined)}
              >
                <AppIcon name='add' size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Offline banner */}
      {offlineCachedAt !== null && (
        <OfflineBanner message={`غير متصل — آخر تحديث ${timeAgoAr(offlineCachedAt)}`} />
      )}

      {/* Sync toast */}
      {syncCount > 0 && isOnline && (
        <View style={styles.syncToast}>
          <AppIcon name="cloudDoneOutline" size={13} color="#fff" />
          <Text style={styles.syncToastText}>تمت مزامنة {syncCount} مراجعة</Text>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : decks.length === 0 ? (
        /* Empty state */
        <View style={styles.empty}>
          <Text style={{ fontSize: 64 }}>🃏</Text>
          <Text style={styles.emptyTitle}>{t('flash.empty_title')}</Text>
          <Text style={styles.emptyText}>
            {t('flash.empty_text')}
          </Text>
          <TouchableOpacity
            style={styles.createFirstBtn}
            onPress={() => navigation.navigate('CreateDeck', undefined)}
          >
            <AppIcon name="addCircleOutline" size={20} color="#fff" />
            <Text style={styles.createFirstBtnText}>{t('flash.create_new')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={d => d.id}
          contentContainerStyle={{ padding: Spacing.lg, gap: 12, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={() => decks.length > 0 ? (
            <TouchableOpacity style={styles.quizBanner} onPress={startQuickQuiz} activeOpacity={0.85}>
              <View style={styles.quizBannerLeft}>
                <Text style={styles.quizBannerIcon}>⚡</Text>
                <View>
                  <Text style={styles.quizBannerTitle}>مسابقة سريعة</Text>
                  <Text style={styles.quizBannerSub}>10 بطاقات عشوائية — بدون تسجيل في الخوارزمية</Text>
                </View>
              </View>
              <AppIcon name="playCircle" size={28} color="#fff" />
            </TouchableOpacity>
          ) : null}
          renderItem={({ item }) => (
            <DeckCard
              deck={item}
              onStudy={() => navigation.navigate('StudySession', {
                deckId: item.id,
                deckTitle: item.title,
                deckColor: item.color,
              })}
              onEdit={() => navigation.navigate('CreateDeck', { deck: item })}
              onDelete={() => deleteDeck(item)}
            />
          )}
        />
      )}

      {/* ── CSV Import Modal ────────────────────────────────────────────── */}
      <Modal visible={csvModalVisible} transparent animationType="slide" onRequestClose={() => setCsvModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📥 استيراد من CSV / Anki</Text>
              <TouchableOpacity onPress={() => setCsvModalVisible(false)}>
                <AppIcon name='close' size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>
              الصيغة المدعومة: <Text style={{ fontWeight: '700' }}>سؤال,جواب</Text> — سطر واحد لكل بطاقة{`\n`}
              يدعم أيضاً الفواصل المنقوطة (;) والجداول (Tab)
            </Text>

            <Text style={styles.fieldLabel}>اسم المجموعة *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="مثال: مصطلحات الكيمياء"
              placeholderTextColor="#9CA3AF"
              value={csvDeckName}
              onChangeText={setCsvDeckName}
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>المادة (اختياري)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="مثال: الكيمياء العضوية"
              placeholderTextColor="#9CA3AF"
              value={csvSubject}
              onChangeText={setCsvSubject}
              textAlign="right"
            />

            <TouchableOpacity
              style={[styles.importConfirmBtn, csvImporting && { opacity: 0.6 }]}
              onPress={handleCSVImport}
              disabled={csvImporting}
            >
              {csvImporting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <AppIcon name="cloudUploadOutline" size={18} color="#fff" />
                  <Text style={styles.importConfirmText}>اختر ملف CSV وابدأ الاستيراد</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

