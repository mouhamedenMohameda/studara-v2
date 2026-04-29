import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Share, Platform, Linking, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ResourcesStackParamList, ResourceType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { apiRequest } from '../../utils/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';
import * as Haptics from 'expo-haptics';
import { saveResourceRating, getResourceRating, trackResourceView } from '../../utils/offlineStorage';
import { safeBack } from '../../utils/safeBack';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';

type Route = RouteProp<ResourcesStackParamList, 'ResourceDetail'>;
type Nav   = StackNavigationProp<ResourcesStackParamList, 'ResourceDetail'>;

const SERVER_BASE = 'https://api.radar-mr.com';

const driveId = (url: string): string | null => {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  return m ? m[1] : null;
};

const toAbsolute = (url: string) =>
  url.startsWith('/') ? `${SERVER_BASE}${url}` : url;

const TYPE_GRADIENT: Record<ResourceType, [string, string]> = {
  [ResourceType.Note]:         ['#8B5CF6', '#6D28D9'],
  [ResourceType.PastExam]:     ['#EF4444', '#B91C1C'],
  [ResourceType.Summary]:      ['#10B981', '#047857'],
  [ResourceType.Exercise]:     ['#F59E0B', '#B45309'],
  [ResourceType.Project]:      ['#3B82F6', '#1D4ED8'],
  [ResourceType.Presentation]: ['#EC4899', '#BE185D'],
  [ResourceType.VideoCourse]:  ['#6366F1', '#4338CA'],
};

const TYPE_LABELS: Record<ResourceType, string> = {
  [ResourceType.Note]:         'ملاحظات',
  [ResourceType.PastExam]:     'امتحانات سابقة',
  [ResourceType.Summary]:      'ملخص',
  [ResourceType.Exercise]:     'تمارين',
  [ResourceType.Project]:      'مشروع',
  [ResourceType.Presentation]: 'عرض تقديمي',
  [ResourceType.VideoCourse]:  'دورة فيديو',
};

const TYPE_ICONS: Record<ResourceType, AppIconName> = {
  [ResourceType.Note]:         'documentText',
  [ResourceType.PastExam]:     'school',
  [ResourceType.Summary]:      'list',
  [ResourceType.Exercise]:     'barbell',
  [ResourceType.Project]:      'construct',
  [ResourceType.Presentation]: 'easel',
  [ResourceType.VideoCourse]:  'playCircle',
};

// Feature toggle: hide AI Summary in production until officially launched.
const AI_SUMMARY_ENABLED = false;
// Feature toggle: hide AI Flashcards in production until officially launched.
const AI_FLASHCARDS_ENABLED = false;

const ResourceDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const { params: { resource } } = useRoute<Route>();
  const { user, token } = useAuth();
  const { lang } = useLanguage();
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isAr = lang === 'ar';
  const scrollY = useRef(new Animated.Value(0)).current;
  const heroScale = scrollY.interpolate({
    inputRange: [-120, 0, 220],
    outputRange: [1.06, 1, 0.94],
    extrapolate: 'clamp',
  });
  const heroFade = scrollY.interpolate({
    inputRange: [0, 140, 240],
    outputRange: [1, 0.6, 0.25],
    extrapolate: 'clamp',
  });
  const headerGlassOpacity = scrollY.interpolate({
    inputRange: [0, 70, 130],
    outputRange: [0, 0.35, 0.85],
    extrapolate: 'clamp',
  });

  const backToHomeIfRoot = useCallback(() => {
    const state = (navigation as any)?.getState?.();
    const routesLen = Array.isArray(state?.routes) ? state.routes.length : 0;
    if (routesLen > 1 && (navigation as any)?.goBack) {
      (navigation as any).goBack();
      return;
    }
    // If opened as first screen (deep link / last watched), don't go back to Explore->Timetable.
    smoothGoHomeTab(navigation as any);
  }, [navigation]);

  const gradient = TYPE_GRADIENT[resource.type];
  const isOwner  = user?.id === resource.uploadedBy.id || user?.role === 'admin';
  const qc = useQueryClient();

  const [liked,         setLiked]         = useState(resource.isLiked     ?? false);
  const [bookmarked,    setBookmarked]    = useState(resource.isBookmarked ?? false);
  const [likesCount,    setLikesCount]    = useState(resource.likes        ?? 0);
  const [myRating,      setMyRating]      = useState(0);
  const [avgRating,     setAvgRating]     = useState<number | null>(null);
  const [ratingCount,   setRatingCount]   = useState(0);
  const [flashDone,     setFlashDone]     = useState(false);
  const [summaryText,   setSummaryText]   = useState<string | null>(null);
  const [summaryDone,   setSummaryDone]   = useState(false);
  const [summaryHint,   setSummaryHint]   = useState<string | null>(null);

  useEffect(() => {
    // Load local rating immediately (instant UI)
    getResourceRating(resource.id).then(setMyRating);
    // Fetch community aggregate + my server-side score
    if (token) {
      apiRequest<{ my_score: number; avg_rating: number | null; rating_count: number }>(
        `/resources/${resource.id}/my-rating`,
        { token }
      ).then(data => {
        if (data.my_score > 0) setMyRating(data.my_score);
        setAvgRating(data.avg_rating);
        setRatingCount(data.rating_count);
      }).catch(() => {});
    }
  }, [resource.id, token]);

  useEffect(() => {
    trackResourceView(resource).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.id]);

  const handleRate = useCallback((star: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newRating = myRating === star ? 0 : star; // tap same star = toggle off
    setMyRating(newRating);
    // Save locally (offline-first)
    saveResourceRating(resource.id, newRating).catch(() => {});
    // Sync to server (fire-and-forget, update aggregate on success)
    if (token) {
      apiRequest<{ my_score: number; avg_rating: number | null; rating_count: number }>(
        `/resources/${resource.id}/rate`,
        { method: 'POST', token, body: { score: newRating } }
      ).then(data => {
        setAvgRating(data.avg_rating);
        setRatingCount(data.rating_count);
      }).catch(() => {});
    }
  }, [myRating, resource.id, token]);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/resources/${resource.id}`, { method: 'DELETE', token: token! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.resources.all() });
      Alert.alert('تم الحذف', 'تم حذف المورد بنجاح.', [
        { text: 'حسناً', onPress: backToHomeIfRoot },
      ]);
    },
    onError: (e: any) => Alert.alert('خطأ', e.message),
  });

  const likeMutation = useMutation({
    mutationFn: () => apiRequest<{ liked: boolean }>(`/resources/${resource.id}/like`, { method: 'POST', token: token! }),
    onMutate: () => {
      // Optimistic update — UI réagit instantanément
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newLiked = !liked;
      setLiked(newLiked);
      setLikesCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
      return { prevLiked: liked, prevCount: likesCount };
    },
    onError: (_err, _vars, ctx) => {
      // Revert si erreur serveur
      if (ctx) { setLiked(ctx.prevLiked); setLikesCount(ctx.prevCount); }
    },
    onSuccess: (data) => {
      setLiked(data.liked);
      setLikesCount(prev => data.liked ? prev + 1 : Math.max(0, prev - 1));
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: () => apiRequest<{ bookmarked: boolean }>(`/resources/${resource.id}/bookmark`, { method: 'POST', token: token! }),
    onMutate: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newBookmarked = !bookmarked;
      setBookmarked(newBookmarked);
      return { prevBookmarked: bookmarked };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) setBookmarked(ctx.prevBookmarked);
    },
    onSuccess: (data) => setBookmarked(data.bookmarked),
  });

  const flashcardMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ deck: any; cards: any[]; already_existed: boolean }>(
        `/resources/${resource.id}/flashcards`,
        { method: 'POST', token: token! },
      ),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFlashDone(true);
      const cardCount = data.cards?.length ?? 0;
      const existed   = data.already_existed;
      Alert.alert(
        existed ? '✅ Deck existant' : '✨ Flashcards créées !',
        existed
          ? `Tu as déjà un deck de ${cardCount} flashcards pour ce document.`
          : `${cardCount} flashcards ont été créées automatiquement à partir de ce document !`,
        [{ text: 'Super !', style: 'default' }],
      );
      qc.invalidateQueries({ queryKey: queryKeys.flashcards.decks() });
    },
    onError: (e: any) => Alert.alert('Erreur', e.message ?? 'Impossible de générer les flashcards'),
  });

  const summaryMutation = useMutation({
    mutationFn: () =>
      apiRequest<{
        summary: string;
        cached: boolean;
        course_text_source?: 'pdf' | 'metadata_only' | null;
        course_text_truncated?: boolean | null;
      }>(
        `/ai/resources/${resource.id}/summary`,
        { method: 'POST', token: token! },
      ),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSummaryText(data.summary);
      setSummaryDone(true);
      const parts: string[] = [];
      if (data.cached) {
        parts.push('✅ هذا الملخّص تم توليده سابقًا (مخزّن) — لا يتم الخصم مرة ثانية.');
      }
      if (data.course_text_source === 'metadata_only') {
        parts.push('ملخّص مبني على بيانات المورد فقط (لا يوجد نص مستخرج من الملف على الخادم).');
      }
      if (data.course_text_truncated) {
        parts.push('تم اقتطاع جزء من نص المستند بسبب الحد الأقصى للطول.');
      }
      setSummaryHint(parts.length ? parts.join(' ') : null);
    },
    onError: (e: any) => Alert.alert('خطأ', e.message ?? 'تعذّر توليد الملخص'),
  });

  const openFile = () => {
    if (!resource.fileUrl) { Alert.alert('لا يوجد ملف', 'هذا المورد لا يحتوي على ملف مرفق'); return; }

    // Count download (best-effort)
    apiRequest(`/resources/${resource.id}/download`, { method: 'POST', token }).catch(() => {});

    // Android: open externally (reliable for PDF/PPTX/DOCX via server preview).
    if (Platform.OS === 'android') {
      const raw = resource.fileUrl || '';
      const abs = toAbsolute(raw);
      const id = driveId(abs);

      const tryOpen = async (url: string) => {
        const can = await Linking.canOpenURL(url);
        if (!can) throw new Error('cannot_open_url');
        await Linking.openURL(url);
      };

      (async () => {
        try {
          if (id) {
            // Prefer "open?id=" which is more likely to open the Drive app / Chrome cleanly on Android.
            await tryOpen(`https://drive.google.com/open?id=${id}`);
            return;
          }
          if (raw.startsWith('/uploads/')) {
            // Server upload → open /preview which converts Office → PDF
            await tryOpen(`${SERVER_BASE}/api/v1/resources/${resource.id}/preview?t=${encodeURIComponent(token || '')}`);
            return;
          }
          // Fallback: open the original absolute URL (could be Drive/view or any other host)
          await tryOpen(abs);
        } catch {
          Alert.alert('خطأ', 'تعذّر فتح الملف على Android. جرّب تثبيت Chrome أو Google Drive.');
        }
      })();
      return;
    }

    // iOS: keep in-app viewer (works)
    navigation.navigate('ResourceViewer', { resource, previewMode: false });
  };

  const handleShare = useCallback(() => {
    const title = resource.titleAr || resource.title;
    Share.share({
      title,
      message: `📚 ${title}\n📖 ${resource.subject} — السنة ${resource.year}\n\n🎓 اكتشف هذه المادة على تطبيق Studara — التطبيق الأول للطلاب الموريتانيين`,
    });
  }, [resource]);

  return (
    <View style={styles.root}>
      {/* Ambient background */}
      <LinearGradient
        colors={[`${gradient[0]}22`, `${gradient[1]}12`, `${C.background}`]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.ambient}
      />

      {/* Glass header overlay (appears on scroll) */}
      <SafeAreaView edges={['top']} style={styles.glassHeaderSafe}>
        <Animated.View style={[styles.glassHeader, { opacity: headerGlassOpacity }]}>
          <View style={styles.glassHeaderInner}>
            <Text style={styles.glassHeaderTitle} numberOfLines={1}>
              {resource.titleAr || resource.title}
            </Text>
          </View>
        </Animated.View>
        <View style={styles.headerRowAbsolute}>
          <TouchableOpacity onPress={backToHomeIfRoot} style={styles.backBtn}>
            <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.backBtn}>
            <AppIcon name="shareOutline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        {/* ── Hero header (parallax) ── */}
        <Animated.View style={[styles.heroWrap, { transform: [{ scale: heroScale }], opacity: heroFade }]}>
          <LinearGradient colors={gradient} style={styles.hero}>
            {/* Decorative blobs */}
            <View style={[styles.blob, styles.blobA]} />
            <View style={[styles.blob, styles.blobB]} />
            <View style={[styles.blob, styles.blobC]} />

            <View style={styles.heroBody}>
              <View style={styles.iconWrap}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.10)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconGlass}
                >
                  <AppIcon name={TYPE_ICONS[resource.type]} size={40} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {resource.titleAr || resource.title}
              </Text>
              <View style={styles.heroMetaRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{TYPE_LABELS[resource.type]}</Text>
                </View>
                <View style={[styles.badge, styles.badgeLight]}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {resource.subject}{' · '}{'السنة ' + resource.year}
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
        {/* ── Meta pills ── */}
        <View style={styles.metaCard}>
          <View style={styles.pillsRow}>
            <View style={styles.pill}>
              <AppIcon name="bookOutline" size={13} color={gradient[0]} />
              <Text style={[styles.pillText, { color: gradient[0] }]} numberOfLines={1}>{resource.subject}</Text>
            </View>
            <View style={styles.pill}>
              <AppIcon name="layersOutline" size={13} color={gradient[0]} />
              <Text style={[styles.pillText, { color: gradient[0] }]} numberOfLines={1}>{'السنة ' + resource.year}</Text>
            </View>
            {resource.fileType && (
              <View style={styles.pill}>
                <AppIcon name="documentOutline" size={13} color={gradient[0]} />
                <Text style={[styles.pillText, { color: gradient[0] }]} numberOfLines={1}>{resource.fileType.toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Description ── */}
        {!!resource.description && (
          <View style={styles.descCard}>
            <Text style={styles.sectionTitle}>الوصف</Text>
            <Text style={styles.descText}>{resource.description}</Text>
          </View>
        )}

        {/* ── Like / Bookmark ── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, liked && styles.actionBtnLiked]}
            onPress={() => token ? likeMutation.mutate() : Alert.alert('', 'يرجى تسجيل الدخول')}
          activeOpacity={0.75}
          >
            <AppIcon name={liked ? 'heart' : 'heartOutline'} size={20} color={liked ? '#EF4444' : '#9CA3AF'} />
            <Text style={[styles.actionBtnText, liked && { color: '#EF4444' }]}>
              {likesCount > 0 ? String(likesCount) : 'إعجاب'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, bookmarked && styles.actionBtnSaved]}
            onPress={() => token ? bookmarkMutation.mutate() : Alert.alert('', 'يرجى تسجيل الدخول')}
            activeOpacity={0.75}
          >
            <AppIcon name={bookmarked ? 'bookmark' : 'bookmarkOutline'} size={20} color={bookmarked ? '#7C3AED' : '#9CA3AF'} />
            <Text style={[styles.actionBtnText, bookmarked && { color: '#7C3AED' }]}>
              {bookmarked ? 'محفوظ' : 'حفظ'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleShare}
            activeOpacity={0.75}
          >
            <AppIcon name="shareSocialOutline" size={20} color="#9CA3AF" />
            <Text style={styles.actionBtnText}>مشاركة</Text>
          </TouchableOpacity>
        </View>

        {/* ── Star Rating ── */}
        <View style={styles.ratingCard}>
          <View style={styles.ratingHeader}>
            <Text style={styles.sectionTitle}>التقييم</Text>
            {ratingCount > 0 && (
              <Text style={styles.ratingAvg}>
                ⭐ {avgRating?.toFixed(1)} ({ratingCount} {ratingCount === 1 ? 'تقييم' : 'تقييمات'})
              </Text>
            )}
          </View>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity key={star} onPress={() => handleRate(star)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <AppIcon
                  name={star <= myRating ? 'star' : 'starOutline'}
                  size={28}
                  color={star <= myRating ? '#F59E0B' : '#D1D5DB'}
                />
              </TouchableOpacity>
            ))}
          </View>
          {myRating > 0 && (
            <Text style={styles.ratingNote}>
              {['', 'ضعيف 😕', 'مقبول 🙂', 'جيد 👍', 'جيد جداً ⭐', 'ممتاز 🏆'][myRating]}
            </Text>
          )}
        </View>

        {/* ── Open file ── */}
        <TouchableOpacity
          style={styles.openBtn}
          onPress={openFile}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[gradient[0], gradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.openBtnGrad}
          >
            <View style={styles.openBtnLeft}>
              <View style={styles.openBtnIcon}>
                <AppIcon name={resource.type === ResourceType.VideoCourse ? 'play' : 'documentTextOutline'} size={20} color="#fff" />
              </View>
              <View style={styles.openBtnTextCol}>
                <Text style={styles.openBtnText}>
                  {resource.type === ResourceType.VideoCourse ? 'مشاهدة الفيديو' : 'فتح الملف'}
                </Text>
                <Text style={styles.openBtnSub} numberOfLines={1}>
                  {resource.fileName ? resource.fileName : (resource.fileType ? resource.fileType.toUpperCase() : 'Studara')}
                </Text>
              </View>
            </View>
            <View style={styles.openBtnHint}>
              <Text style={styles.openBtnHintText}>عرض</Text>
              <AppIcon name={isAr ? 'chevronBack' : 'chevronForward'} size={16} color="rgba(255,255,255,0.9)" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Auto-generate flashcards (Soon) ── */}
        {!!token && AI_FLASHCARDS_ENABLED && (
          <TouchableOpacity
            style={[styles.flashBtn, flashDone && styles.flashBtnDone]}
            onPress={() => {
              if (flashDone) return;
              if (!token) { Alert.alert('', 'يرجى تسجيل الدخول'); return; }
              flashcardMutation.mutate();
            }}
            activeOpacity={0.85}
            disabled={flashcardMutation.isPending}
          >
            {flashcardMutation.isPending
              ? <ActivityIndicator size="small" color="#8B5CF6" />
              : <AppIcon name={flashDone ? 'checkmarkCircle' : 'albumsOutline'} size={20} color={flashDone ? '#10B981' : '#8B5CF6'} />
            }
            <Text style={[styles.flashBtnText, flashDone && { color: '#10B981' }]}>
              {flashDone ? 'Deck créé ✓' : '✨ Créer des flashcards'}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── AI Summary (Soon) ── */}
        {!!token && AI_SUMMARY_ENABLED && (
          <TouchableOpacity
            style={[styles.summaryBtn, summaryDone && styles.summaryBtnDone]}
            onPress={() => { if (!summaryDone) summaryMutation.mutate(); }}
            activeOpacity={0.85}
            disabled={summaryMutation.isPending || summaryDone}
          >
            {summaryMutation.isPending
              ? <ActivityIndicator size="small" color="#10B981" />
              : <AppIcon name={summaryDone ? 'checkmarkCircle' : 'readerOutline'} size={20} color={summaryDone ? '#fff' : '#10B981'} />
            }
            <Text style={[styles.summaryBtnText, summaryDone && { color: '#fff' }]}>
              {summaryDone ? 'تم إنشاء الملخص ✓' : '✨ ملخّص ذكي بالذكاء الاصطناعي'}
            </Text>
          </TouchableOpacity>
        )}
        {!!summaryText && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <AppIcon name='sparkles' size={16} color="#10B981" />
              <Text style={styles.summaryCardTitle}>الملخّص الذكي</Text>
            </View>
            {!!summaryHint && (
              <Text style={styles.summaryHintText}>{summaryHint}</Text>
            )}
            <Text style={styles.summaryCardText}>{summaryText}</Text>
          </View>
        )}

        {/* ── Delete (owner only) ── */}
        {isOwner && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() =>
              Alert.alert('حذف المورد', 'هل أنت متأكد؟', [
                { text: 'إلغاء', style: 'cancel' },
                { text: 'حذف', style: 'destructive', onPress: () => deleteMutation.mutate() },
              ])
            }
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending
              ? <ActivityIndicator size="small" color="#EF4444" />
              : <AppIcon name="trashOutline" size={16} color="#EF4444" />
            }
            <Text style={styles.deleteBtnText}>حذف</Text>
          </TouchableOpacity>
        )}
      </Animated.ScrollView>
    </View>
  );
};

const makeStyles = (C: typeof import('../../theme').Colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  ambient: { ...StyleSheet.absoluteFillObject },

  glassHeaderSafe: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerRowAbsolute: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glassHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
  },
  glassHeaderInner: {
    marginHorizontal: 16,
    marginTop: 8,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(17,24,39,0.22)',
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  glassHeaderTitle: {
    color: 'rgba(255,255,255,0.94)',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },

  /* Hero */
  heroWrap: { marginBottom: 10 },
  hero: { paddingBottom: 34, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  backBtn: {
    margin: 12, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBody: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 84, paddingBottom: 14, gap: 12 },
  iconWrap: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
  },
  iconGlass: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: 0.2,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20,
  },
  badgeLight: { backgroundColor: 'rgba(255,255,255,0.18)' },
  badgeText: { fontSize: 12, color: '#fff', fontWeight: '700' },

  blob: { position: 'absolute', borderRadius: 999, opacity: 0.22 },
  blobA: { width: 260, height: 260, backgroundColor: '#fff', top: -120, left: -90 },
  blobB: { width: 200, height: 200, backgroundColor: '#000', top: -90, right: -70, opacity: 0.10 },
  blobC: { width: 240, height: 240, backgroundColor: '#fff', bottom: -140, right: -90, opacity: 0.14 },

  /* Scroll */
  scroll: { padding: 18, gap: 14, paddingBottom: 72, paddingTop: 0 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.textSecondary,
    textAlign: 'right',
    marginBottom: 8,
  },

  /* Pills */
  metaCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(139,92,246,0.10)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    maxWidth: '100%',
  },
  pillText: { fontSize: 13, fontWeight: '700' },

  /* Description */
  descCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
  },
  descText: { fontSize: 14, color: C.textSecondary, textAlign: 'right', lineHeight: 24 },

  /* Actions */
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  actionBtnLiked: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actionBtnSaved: { borderColor: '#C4B5FD', backgroundColor: '#EDE9FE' },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: C.textMuted },

  /* Open */
  openBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  openBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  openBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 10 },
  openBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  openBtnTextCol: { flex: 1, gap: 2 },
  openBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  openBtnSub: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.78)' },
  openBtnHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  openBtnHintText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.92)' },

  /* Flashcards auto */
  flashBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 16, paddingVertical: 15,
    borderWidth: 2, borderColor: '#8B5CF6', backgroundColor: C.surface,
    shadowColor: '#8B5CF6', shadowOpacity: 0.12, shadowRadius: 8, elevation: 2,
  },
  flashBtnDone: { borderColor: '#10B981', backgroundColor: C.surface },
  flashBtnText: { fontSize: 15, fontWeight: '700', color: '#8B5CF6' },

  /* AI Summary button */
  summaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 16, paddingVertical: 15,
    borderWidth: 2, borderColor: '#10B981', backgroundColor: C.surface,
    shadowColor: '#10B981', shadowOpacity: 0.12, shadowRadius: 8, elevation: 2,
  },
  summaryBtnDone: { borderColor: '#10B981', backgroundColor: '#10B981' },
  summaryBtnText: { fontSize: 15, fontWeight: '700', color: '#10B981' },

  /* AI Summary card */
  summaryCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, gap: 10,
    borderWidth: 1.5, borderColor: '#6EE7B7',
    shadowColor: '#10B981', shadowOpacity: 0.1, shadowRadius: 8, elevation: 2,
  },
  summaryCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryCardTitle: { fontSize: 14, fontWeight: '800', color: '#10B981' },
  summaryHintText: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 18,
    textAlign: 'right',
    fontStyle: 'italic',
  },
  summaryCardText: { fontSize: 14, color: C.textSecondary, lineHeight: 24, textAlign: 'right' },

  /* Delete */
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },

  /* Star Rating */
  ratingCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  ratingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  ratingAvg: { fontSize: 12, fontWeight: '600', color: '#F59E0B' },
  starsRow: { flexDirection: 'row', gap: 8, alignSelf: 'center', justifyContent: 'center' },
  ratingNote: { fontSize: 13, color: '#F59E0B', fontWeight: '700' },
});

export default ResourceDetailScreen;
