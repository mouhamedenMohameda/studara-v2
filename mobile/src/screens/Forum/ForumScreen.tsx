/**
 * ForumScreen — #4 Forum / Q&A par matière
 * Liste des posts, filtres, FAB pour créer, modal de création
 */
import React, { useState, useCallback, useMemo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, FlatList, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { apiRequest } from '../../utils/api';
import { ForumPost } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '../../theme';
import { safeBack } from '../../utils/safeBack';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgoAr(dateStr: string): string {
  if (!dateStr) return '';
  // Normalize: replace space-separator with T so Hermes can parse it
  const normalized = String(dateStr).replace(' ', 'T').replace(/\+.*$/, 'Z');
  const ms = new Date(normalized).getTime();
  if (isNaN(ms)) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'للتو';
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  const d = Math.floor(h / 24);
  return `منذ ${d} ي`;
}

const SUBJECTS = [
  'الكل', 'الرياضيات', 'الفيزياء', 'الكيمياء', 'البيولوجيا',
  'Informatique', 'Algorithmique', 'Maths', 'Physique', 'Économie',
  'الحقوق', 'الأدب', 'التاريخ',
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ForumScreen() {
  const navigation = useNavigation<any>();
  const { token, user } = useAuth();
  const { lang, t } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const isAr = lang === 'ar';

  const [posts, setPosts]         = useState<ForumPost[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);
  const [filterSubject, setFilterSubject] = useState('');
  const [searchQ, setSearchQ]     = useState('');

  // Create post modal
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle]   = useState('');
  const [newBody, setNewBody]     = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [creating, setCreating]   = useState(false);

  const fetchPosts = useCallback(async (p = 1, replace = true) => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (filterSubject && filterSubject !== 'الكل') params.set('subject', filterSubject);
      if (searchQ.trim()) params.set('q', searchQ.trim());
      const data = await apiRequest<{ posts: ForumPost[]; hasMore: boolean }>(`/forum/posts?${params}`, { token });
      setPosts(prev => replace ? (data.posts ?? []) : [...prev, ...(data.posts ?? [])]);
      setHasMore(data.hasMore ?? false);
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, filterSubject, searchQ]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchPosts(1, true);
  }, [fetchPosts]));

  const handleCreate = async () => {
    if (!newTitle.trim() || !newBody.trim()) {
      Alert.alert(t('forum.error'), t('forum.error_required'));
      return;
    }
    setCreating(true);
    try {
      const created = await apiRequest<ForumPost>('/forum/posts', {
        method: 'POST', token,
        body: { title: newTitle.trim(), body: newBody.trim(), subject: newSubject.trim() || undefined, faculty: user?.faculty },
      });
      setPosts(prev => [created, ...prev]);
      setShowCreate(false);
      setNewTitle(''); setNewBody(''); setNewSubject('');
    } catch (e: any) {
      Alert.alert(t('forum.error'), e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  const renderPost = ({ item }: { item: ForumPost }) => (
    <TouchableOpacity
      style={styles.postCard}
      onPress={() => navigation.navigate('ForumPost', { postId: item.id, postTitle: item.title })}
      activeOpacity={0.85}
    >
      {item.hasBestAnswer && (
        <View style={styles.solvedBadge}>
          <Text style={styles.solvedText}>{t('forum.solved')}</Text>
        </View>
      )}
      <Text style={styles.postTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.postBody} numberOfLines={2}>{item.body}</Text>

      <View style={styles.postMeta}>
        <View style={styles.metaLeft}>
          {item.subject ? (
            <View style={styles.subjectChip}>
              <Text style={styles.subjectText}>{item.subject}</Text>
            </View>
          ) : null}
          <Text style={styles.metaText}>{item.authorName}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{timeAgoAr(item.createdAt)}</Text>
        </View>
        <View style={styles.metaRight}>
          <AppIcon name="arrowUpOutline" size={13} color={item.isUpvoted ? Colors.primary : C.textSecondary} />
          <Text style={[styles.metaNum, item.isUpvoted && { color: Colors.primary }]}>{item.upvotes}</Text>
          <AppIcon name="chatbubbleOutline" size={13} color={C.textSecondary} style={{ marginLeft: 8 }} />
          <Text style={styles.metaNum}>{item.repliesCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <LinearGradient
        colors={Gradients.brand as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(navigation)} style={styles.backBtn}>
            <AppIcon name={isAr ? 'chevronForward' : 'chevronBack'} size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>💬 {t('forum.title')}</Text>
            <Text style={styles.headerSub}>{t('forum.subtitle')}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <AppIcon name="searchOutline" size={16} color={C.textSecondary} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('forum.search_placeholder')}
            placeholderTextColor={C.textSecondary}
            value={searchQ}
            onChangeText={t => { setSearchQ(t); }}
            onSubmitEditing={() => { setLoading(true); fetchPosts(1, true); }}
            textAlign={isAr ? 'right' : 'left'}
          />
          {searchQ.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQ(''); setLoading(true); fetchPosts(1, true); }}>
              <AppIcon name="closeCircle" size={16} color={C.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Subject filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {SUBJECTS.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, (filterSubject === s || (s === 'الكل' && !filterSubject)) && styles.filterChipActive]}
              onPress={() => {
                setFilterSubject(s === 'الكل' ? '' : s);
                setLoading(true);
              }}
            >
              <Text style={[styles.filterText, (filterSubject === s || (s === 'الكل' && !filterSubject)) && styles.filterTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
      </LinearGradient>

      {/* Posts */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={Colors.primary} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={p => p.id}
          renderItem={renderPost}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchPosts(1, true); }}
          onEndReached={() => hasMore && fetchPosts(page + 1, false)}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>💬</Text>
              <Text style={styles.emptyTitle}>{t('forum.empty_title')}</Text>
              <Text style={styles.emptyText}>{t('forum.empty_text')}</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
        <AppIcon name='add' size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create post modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView edges={['top']}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={{ padding: 4 }}>
                <AppIcon name='close' size={24} color={C.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{t('forum.new_question')}</Text>
              <TouchableOpacity
                style={[styles.postBtn, (!newTitle.trim() || !newBody.trim() || creating) && styles.postBtnDisabled]}
                onPress={handleCreate}
                disabled={!newTitle.trim() || !newBody.trim() || creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.postBtnText}>{t('forum.publish')}</Text>}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.md, gap: 12 }} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.titleInput}
              placeholder={t('forum.question_title_ph')}
              placeholderTextColor={C.textSecondary}
              value={newTitle}
              onChangeText={setNewTitle}
              maxLength={200}
              textAlign={isAr ? 'right' : 'left'}
            />
            <TextInput
              style={styles.bodyInput}
              placeholder={t('forum.question_body_ph')}
              placeholderTextColor={C.textSecondary}
              value={newBody}
              onChangeText={setNewBody}
              multiline
              textAlignVertical="top"
              textAlign={isAr ? 'right' : 'left'}
            />
            <TextInput
              style={styles.subjectInput}
              placeholder={t('forum.question_subject_ph')}
              placeholderTextColor={C.textSecondary}
              value={newSubject}
              onChangeText={setNewSubject}
              maxLength={100}
              textAlign={isAr ? 'right' : 'left'}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (C: any, isDark: boolean) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 6, paddingBottom: 12, gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.92)', fontWeight: '600', marginTop: 2 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.md,
    marginTop: 10, marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    borderRadius: BorderRadius.lg, paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  filtersRow: { paddingHorizontal: Spacing.md, paddingVertical: 10, gap: 8, paddingBottom: 14 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  filterChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterText: { fontSize: 13, color: '#fff', fontWeight: '700' },
  filterTextActive: { color: Colors.primary, fontWeight: '800' },

  postCard: {
    backgroundColor: C.surface, borderRadius: BorderRadius['2xl'],
    padding: Spacing.base, marginBottom: 10,
    ...Shadows.sm,
    borderWidth: 1, borderColor: C.borderLight,
  },
  solvedBadge: {
    alignSelf: 'flex-start', backgroundColor: '#D1FAE5',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6,
  },
  solvedText: { fontSize: 11, color: '#065F46', fontWeight: '600' },
  postTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 4 },
  postBody: { fontSize: 13, color: C.textSecondary, lineHeight: 19, marginBottom: 10 },
  postMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, flexWrap: 'wrap' },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  subjectChip: {
    backgroundColor: isDark ? '#1E1B4B' : '#EDE9FE',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  subjectText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  metaText: { fontSize: 12, color: C.textSecondary },
  metaDot: { fontSize: 12, color: C.textSecondary },
  metaNum: { fontSize: 12, color: C.textSecondary, marginLeft: 2 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.textPrimary },
  emptyText: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },

  fab: {
    position: 'absolute', bottom: 100, right: 20,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    ...Shadows.brand,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: C.textPrimary },
  postBtn: { backgroundColor: Colors.primary, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 7 },
  postBtnDisabled: { backgroundColor: '#9CA3AF' },
  postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  titleInput: {
    backgroundColor: isDark ? '#1F2937' : '#F9FAFB',
    borderRadius: BorderRadius.md, padding: 14,
    color: C.textPrimary, fontSize: 15, borderWidth: 1, borderColor: C.border,
    fontWeight: '600',
  },
  bodyInput: {
    backgroundColor: isDark ? '#1F2937' : '#F9FAFB',
    borderRadius: BorderRadius.md, padding: 14, minHeight: 140,
    color: C.textPrimary, fontSize: 14, borderWidth: 1, borderColor: C.border,
  },
  subjectInput: {
    backgroundColor: isDark ? '#1F2937' : '#F9FAFB',
    borderRadius: BorderRadius.md, padding: 14,
    color: C.textPrimary, fontSize: 14, borderWidth: 1, borderColor: C.border,
  },
});
