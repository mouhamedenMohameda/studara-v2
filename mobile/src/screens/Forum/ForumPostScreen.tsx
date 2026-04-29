/**
 * ForumPostScreen — Détail d'un post + réponses
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { apiRequest } from '../../utils/api';
import { ForumPost, ForumReply, RootStackParamList } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Gradients } from '../../theme';
import { safeBack } from '../../utils/safeBack';

type Route = RouteProp<RootStackParamList, 'ForumPost'>;

function timeAgoAr(dateStr: string): string {
  if (!dateStr) return '';
  const normalized = String(dateStr).replace(' ', 'T').replace(/\+.*$/, 'Z');
  const ms = new Date(normalized).getTime();
  if (isNaN(ms)) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'للتو';
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  return `منذ ${Math.floor(h / 24)} ي`;
}

export default function ForumPostScreen() {
  const navigation = useNavigation<any>();
  const { params: { postId } } = useRoute<Route>();
  const { token, user } = useAuth();
  const { lang, t } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const isAr = lang === 'ar';
  const listRef = useRef<FlatList>(null);

  const [post, setPost]       = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ post: ForumPost; replies: ForumReply[] }>(`/forum/posts/${postId}`, { token });
      setPost(data.post);
      setReplies(data.replies ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token, postId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleUpvotePost = async () => {
    if (!post) return;
    try {
      const res = await apiRequest<{ isUpvoted: boolean }>(`/forum/posts/${post.id}/upvote`, { method: 'POST', token });
      setPost(prev => prev ? { ...prev, upvotes: prev.upvotes + (res.isUpvoted ? 1 : -1), isUpvoted: res.isUpvoted } : prev);
    } catch (e: any) { Alert.alert('Error', e?.message); }
  };

  const handleUpvoteReply = async (reply: ForumReply) => {
    try {
      const res = await apiRequest<{ isUpvoted: boolean }>(`/forum/replies/${reply.id}/upvote`, { method: 'POST', token });
      setReplies(prev => prev.map(r => r.id === reply.id
        ? { ...r, upvotes: r.upvotes + (res.isUpvoted ? 1 : -1), isUpvoted: res.isUpvoted }
        : r));
    } catch (e: any) { Alert.alert('Error', e?.message); }
  };

  const handleMarkBest = async (reply: ForumReply) => {
    try {
      const res = await apiRequest<{ isBestAnswer: boolean }>(`/forum/replies/${reply.id}/best`, { method: 'PATCH', token });
      setReplies(prev => prev.map(r => ({ ...r, isBestAnswer: r.id === reply.id ? res.isBestAnswer : false })));
    } catch (e: any) { Alert.alert('Error', e?.message); }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const newReply = await apiRequest<ForumReply>(`/forum/posts/${postId}/replies`, {
        method: 'POST', token,
        body: { body: replyText.trim() },
      });
      setReplies(prev => [...prev, newReply]);
      setPost(prev => prev ? { ...prev, repliesCount: prev.repliesCount + 1 } : prev);
      setReplyText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e: any) { Alert.alert(t('forum.error'), e?.message ?? String(e)); }
    finally { setSending(false); }
  };

  const handleDeletePost = () => {
    Alert.alert(
      t('forum.delete_question'),
      t('forum.delete_confirm'),
      [
        { text: t('forum.cancel'), style: 'cancel' },
        { text: t('forum.delete_question').replace('Supprimer la ', '').replace('Delete ', '').replace('حذف ال', ''), style: 'destructive', onPress: async () => {
          try {
            await apiRequest(`/forum/posts/${postId}`, { method: 'DELETE', token });
            safeBack(navigation);
          } catch (e: any) { Alert.alert('Error', e?.message); }
        }},
      ]
    );
  };

  const renderReply = ({ item }: { item: ForumReply }) => {
    const isPostAuthor = post?.userId === user?.id;
    return (
      <View style={[styles.replyCard, item.isBestAnswer && styles.replyCardBest]}>
        {item.isBestAnswer && (
          <View style={styles.bestBadge}>
            <AppIcon name="checkmarkCircle" size={14} color="#065F46" />
            <Text style={styles.bestText}>{t('forum.best_answer')}</Text>
          </View>
        )}
        <View style={styles.replyHeader}>
          <View style={styles.replyAvatar}>
            <Text style={{ fontSize: 14 }}>👤</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyAuthor}>{item.authorName}</Text>
            <Text style={styles.replyTime}>{timeAgoAr(item.createdAt)}</Text>
          </View>
          {isPostAuthor && !item.isBestAnswer && (
            <TouchableOpacity onPress={() => handleMarkBest(item)} style={styles.markBestBtn}>
              <Text style={styles.markBestText}>{t('forum.mark_best')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.replyBody}>{item.body}</Text>
        <View style={styles.replyActions}>
          <TouchableOpacity style={styles.upvoteBtn} onPress={() => handleUpvoteReply(item)}>
            <AppIcon name="arrowUp" size={14} color={item.isUpvoted ? Colors.primary : C.textSecondary} />
            <Text style={[styles.upvoteCount, item.isUpvoted && { color: Colors.primary }]}>{item.upvotes}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <LinearGradient colors={Gradients.brand as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(navigation)} style={styles.backBtn}>
            <AppIcon name={isAr ? 'chevronForward' : 'chevronBack'} size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{t('forum.title').replace('💬 ', '')}</Text>
          {post?.userId === user?.id && (
            <TouchableOpacity onPress={handleDeletePost} style={{ padding: 8 }}>
              <AppIcon name="trashOutline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={replies}
          keyExtractor={r => r.id}
          renderItem={renderReply}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 16 }}
          ListHeaderComponent={post ? (
            <View style={styles.postCard}>
              <Text style={styles.postTitle}>{post.title}</Text>
              {post.subject ? (
                <View style={styles.subjectChip}>
                  <Text style={styles.subjectText}>{post.subject}</Text>
                </View>
              ) : null}
              <Text style={styles.postBody}>{post.body}</Text>
              <View style={styles.postMetaRow}>
                <Text style={styles.metaText}>{post.authorName} · {timeAgoAr(post.createdAt)}</Text>
                <TouchableOpacity style={styles.upvoteBtn} onPress={handleUpvotePost}>
                  <AppIcon name="arrowUp" size={16} color={post.isUpvoted ? Colors.primary : C.textSecondary} />
                  <Text style={[styles.upvoteCount, post.isUpvoted && { color: Colors.primary }]}>{post.upvotes}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.repliesDivider}>
                <Text style={styles.repliesLabel}>
                  {replies.length} {t('forum.replies')}
                </Text>
              </View>
            </View>
          ) : null}
          ListEmptyComponent={
            <View style={styles.noReplies}>
              <Text style={{ fontSize: 32 }}>💬</Text>
              <Text style={styles.noRepliesText}>{t('forum.no_replies')}</Text>
            </View>
          }
        />

        {/* Reply input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={t('forum.reply_placeholder')}
            placeholderTextColor={C.textSecondary}
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={2000}
            textAlign={isAr ? 'right' : 'left'}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!replyText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSendReply}
            disabled={!replyText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <AppIcon name='send' size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (C: any, isDark: boolean) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md,
    paddingTop: 6, paddingBottom: 14, gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },

  postCard: {
    backgroundColor: C.surface, borderRadius: 20, padding: Spacing.base,
    marginBottom: 16,
    borderWidth: 1, borderColor: C.borderLight,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  postTitle: { fontSize: 17, fontWeight: '700', color: C.textPrimary, marginBottom: 8 },
  subjectChip: {
    alignSelf: 'flex-start',
    backgroundColor: isDark ? '#1E1B4B' : '#EDE9FE',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
  },
  subjectText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  postBody: { fontSize: 14, color: C.textPrimary, lineHeight: 22, marginBottom: 12 },
  postMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, color: C.textSecondary },
  upvoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  upvoteCount: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  repliesDivider: {
    marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border,
  },
  repliesLabel: { fontSize: 13, fontWeight: '600', color: C.textSecondary },

  replyCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: C.border,
  },
  replyCardBest: { borderLeftColor: '#10B981', backgroundColor: isDark ? '#0D2818' : '#F0FDF4' },
  bestBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 8, alignSelf: 'flex-start',
  },
  bestText: { fontSize: 11, color: '#065F46', fontWeight: '700' },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  replyAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: isDark ? '#1E1B4B' : '#EDE9FE',
    alignItems: 'center', justifyContent: 'center',
  },
  replyAuthor: { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  replyTime: { fontSize: 11, color: C.textSecondary, marginTop: 1 },
  markBestBtn: {
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: isDark ? '#0D2818' : '#D1FAE5',
  },
  markBestText: { fontSize: 11, color: '#065F46', fontWeight: '600' },
  replyBody: { fontSize: 14, color: C.textPrimary, lineHeight: 21, marginBottom: 8 },
  replyActions: { flexDirection: 'row', alignItems: 'center' },

  noReplies: { alignItems: 'center', paddingTop: 30, gap: 8 },
  noRepliesText: { fontSize: 14, color: C.textSecondary, textAlign: 'center', paddingHorizontal: 20 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.md,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.surface, gap: 8,
  },
  input: {
    flex: 1, backgroundColor: isDark ? '#1F2937' : '#F9FAFB',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    color: C.textPrimary, fontSize: 14, maxHeight: 100,
    borderWidth: 1, borderColor: C.border,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#9CA3AF' },
});
