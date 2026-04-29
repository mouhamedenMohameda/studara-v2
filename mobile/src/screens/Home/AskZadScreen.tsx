/**
 * AskZadScreen — Chat IA Studara
 * Niveaux de réponse liés au quota (offre / messages), sans noms de modèles commerciaux.
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiRequest } from '../../utils/api';
import { Colors, BorderRadius, Spacing, Shadows } from '../../theme';
import { safeBack } from '../../utils/safeBack';

const DAILY_QUOTA = 150;
const CHAT_GRADIENT: [string, string, string] = ['#8B5CF6', '#7C3AED', '#EC4899'];
const CHAT_EMOJI = '🤖';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS_AR = [
  { text: 'اشرح لي مفهوم الخوارزميات', icon: '💡' },
  { text: 'كيف أحضّر لامتحان الرياضيات؟', icon: '📐' },
  { text: 'ما هي أفضل تقنيات الحفظ؟', icon: '🧠' },
  { text: 'ملخص أساسيات الإلكترونيك', icon: '⚡' },
];

const SUGGESTIONS_FR = [
  { text: 'Explique-moi les algorithmes', icon: '💡' },
  { text: 'Comment réviser pour un examen ?', icon: '📐' },
  { text: 'Meilleures techniques de mémorisation ?', icon: '🧠' },
  { text: 'Résumé sur les bases de l\'électronique', icon: '⚡' },
];

// ─── Animated typing dots ─────────────────────────────────────────────────────
function TypingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(480 - i * 160),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 4 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 3.5,
            backgroundColor: color,
            opacity: dot,
            transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AskZadScreen() {
  const navigation = useNavigation();
  const { token } = useAuth();
  const { catalogPlanNameFr } = useSubscription();
  const { colors: C, isDark } = useTheme();
  const { lang } = useLanguage();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const isAr = lang === 'ar';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [dailyQuota, setDailyQuota] = useState(DAILY_QUOTA);
  const [isPremium, setIsPremium] = useState(false);
  const [chatUnlimited, setChatUnlimited] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const creditsRemaining = dailyQuota - creditsUsed;
  const hideQuotaChrome = chatUnlimited;
  const suggestions = isAr ? SUGGESTIONS_AR : SUGGESTIONS_FR;

  // Fetch real credits from server whenever screen gains focus
  const fetchCredits = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest('/ai/credits', { method: 'GET', token }) as any;
      if (data?.creditsUsed !== undefined) {
        setCreditsUsed(data.creditsUsed);
        setDailyQuota(data.dailyQuota ?? DAILY_QUOTA);
        setIsPremium(data.isPremium ?? false);
        setChatUnlimited(!!data.chatUnlimited);
      }
    } catch {
      // silently fail — local state is fine as fallback
    }
  }, [token]);

  useFocusEffect(useCallback(() => { fetchCredits(); }, [fetchCredits]));

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      ts: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const data = await apiRequest<{
        reply: string;
        creditsUsed: number;
        creditsRemaining: number;
      }>('/ai/chat', {
        method: 'POST',
        token,
        // Le serveur applique le modèle par défaut + règles d’abonnement/quota.
        body: { messages: history, clientRequestId: userMsg.id },
      });

      if (typeof data.creditsUsed === 'number') setCreditsUsed(data.creditsUsed);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply ?? '...',
        ts: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '';
      const isQuota = msg.toLowerCase().includes('quota') || e?.status === 429;
      const isSubReq =
        e?.status === 403 &&
        (msg.toLowerCase().includes('subscription') ||
          msg.toLowerCase().includes('abonnement') ||
          msg.toLowerCase().includes('studara'));
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: isSubReq
          ? (isAr
              ? '📚 للوصول إلى مزيد من الميزات والحدود الأعلى، افتح **Studara+** أو **عرضي**.'
              : '📚 Pour accéder à plus de fonctionnalités et à des limites plus hautes, ouvre **Studara+** ou **Mon offre**.')
          : isQuota && !isPremium
            ? (isAr
                ? '🚀 لقد استنفدت رسائلك المجانية اليوم.\n\nراجع **عرضك** أو Studara+ للمزيد ☕'
                : '🚀 Tu as épuisé tes messages gratuits du jour.\n\nOuvre **Mon offre** ou **Studara+** ☕')
            : isQuota
              ? (isAr ? '⚠️ وصلت لحد الرسائل اليومي. يتجدد غداً إن شاء الله 🌅' : '⚠️ Quota journalier atteint. Recharge demain 🌅')
              : msg.length > 0
                ? `⚠️ ${msg}`
                : (isAr ? '⚠️ حدث خطأ. حاول مرة أخرى.' : '⚠️ Une erreur est survenue.'),
        ts: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, token, isAr, isPremium, creditsUsed]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const timeStr = new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isUser) {
      return (
        <View style={styles.msgRowUser}>
          <View style={styles.userBubbleWrap}>
            <LinearGradient
              colors={CHAT_GRADIENT}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.bubbleUser}
            >
              <Text style={styles.bubbleTextUser}>{item.content}</Text>
            </LinearGradient>
            <Text style={styles.timestamp}>{timeStr}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.msgRowBot}>
        <View style={[styles.botAvatar, { backgroundColor: Colors.primary + '25' }]}>
          <Text style={{ fontSize: 17 }}>{CHAT_EMOJI}</Text>
        </View>
        <View style={styles.botBubbleWrap}>
          <View style={[styles.bubbleBot, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <Text style={[styles.bubbleTextBot, { color: C.textPrimary }]}>{item.content}</Text>
          </View>
          <Text style={styles.timestamp}>{timeStr}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* ── Gradient Header ─────────────────────────────────────────────────── */}
      <LinearGradient
        colors={CHAT_GRADIENT}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.headerGradient}
      >
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => safeBack(navigation as any)} style={styles.backBtn}>
              <AppIcon name={isAr ? 'chevronForward' : 'chevronBack'} size={24} color="#fff" />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <View style={styles.headerAvatarWrap}>
                <Text style={{ fontSize: 20 }}>{CHAT_EMOJI}</Text>
                <View style={styles.onlineDot} />
              </View>
              <View style={styles.headerTextCol}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {isAr ? 'مساعدك الذكي' : 'Assistant IA'}
                </Text>
                <Text
                  style={styles.headerSub}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {isAr
                    ? (hideQuotaChrome
                      ? 'ضمن اشتراكك'
                      : 'حسب حصتك اليومية')
                    : (hideQuotaChrome
                      ? 'Inclus dans ton abonnement'
                      : 'Selon ton quota du jour')}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <View style={styles.headerToolsPill}>
                <TouchableOpacity
                  onPress={() => (navigation as any).navigate('Paywall')}
                  style={styles.headerToolHit}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={isAr ? 'Studara+' : 'Studara+'}
                >
                  <AppIcon name="sparklesOutline" size={17} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerToolDivider} />
                <TouchableOpacity
                  onPress={() => (navigation as any).navigate('MyPlan')}
                  style={styles.headerToolHit}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={isAr ? 'عرضي والحدود' : 'Mon offre et quotas'}
                >
                  <AppIcon name="layersOutline" size={17} color="#fff" />
                </TouchableOpacity>
              </View>

              {hideQuotaChrome ? (
                <View style={[styles.creditsPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <AppIcon name="infiniteOutline" size={15} color="#FDE68A" />
                  <Text style={styles.creditsText}>{isAr ? 'ضمن العرض' : 'Inclus'}</Text>
                </View>
              ) : isPremium ? (
                <View style={[styles.creditsPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <AppIcon name="diamondOutline" size={13} color="#FDE68A" />
                  <Text style={styles.creditsText}>{creditsRemaining}/{dailyQuota}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.creditsPill, { backgroundColor: 'rgba(255,255,255,0.22)' }]}
                  onPress={() => (navigation as any).navigate('MyPlan')}
                  activeOpacity={0.8}
                >
                  <AppIcon name="chatbubbleEllipsesOutline" size={13} color="#fff" />
                  <Text style={styles.creditsText}>{creditsRemaining}/{dailyQuota}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => setMessages([])}
                style={styles.clearBtn}
                disabled={messages.length === 0}
              >
                <AppIcon name="trashOutline" size={18} color={messages.length > 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.35)'} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Credit progress bar */}
      {!isPremium && !hideQuotaChrome && (
        <View style={[styles.creditBarWrap, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
          <View style={[styles.creditBarTrack, { backgroundColor: isDark ? '#374151' : '#E2E8F0' }]}>
            <View
              style={[
                styles.creditBarFill,
                {
                  width: `${Math.max(2, Math.min(100, (creditsRemaining / dailyQuota) * 100))}%`,
                  backgroundColor: creditsRemaining <= 10 ? '#EF4444' : creditsRemaining <= dailyQuota * 0.3 ? '#F59E0B' : CHAT_GRADIENT[0],
                },
              ]}
            />
          </View>
          <Text style={[styles.creditBarLabel, { color: creditsRemaining <= 10 ? '#EF4444' : C.textSecondary }]}>
            {creditsRemaining <= 10
              ? (isAr ? `⚠️ ${creditsRemaining} متبق` : `⚠️ ${creditsRemaining} restants`)
              : `${creditsRemaining}/${dailyQuota}`}
          </Text>
        </View>
      )}

      {!isPremium && creditsRemaining <= 10 && (
        <View
          style={[
            styles.upgradeBanner,
            {
              backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.1)',
              borderColor: isDark ? 'rgba(129,140,248,0.35)' : 'rgba(99,102,241,0.22)',
            },
          ]}
        >
          <View style={[styles.upgradeBannerIconWrap, { backgroundColor: isDark ? 'rgba(129,140,248,0.25)' : 'rgba(99,102,241,0.15)' }]}>
            <AppIcon name='sparkles' size={18} color={isDark ? '#A5B4FC' : '#4F46E5'} />
          </View>
          <TouchableOpacity
            style={styles.upgradeBannerMain}
            onPress={() => (navigation as any).navigate('Paywall')}
            activeOpacity={0.88}
          >
            <Text style={[styles.upgradeBannerTitle, { color: C.textPrimary }]}>
              {isAr ? 'تبقّى القليل من الرسائل' : 'Peu de messages restants'}
            </Text>
            <Text style={[styles.upgradeBannerSub, { color: C.textSecondary }]}>
              {isAr
                ? `تبقّى ${creditsRemaining} — Studara+ أو راجع عرضك`
                : `${creditsRemaining} restants — Studara+ ou mon offre`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => (navigation as any).navigate('MyPlan')}
            style={[styles.upgradeBannerSideBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#fff' }]}
          >
            <Text style={[styles.upgradeBannerSideBtnText, { color: '#4F46E5' }]}>
              {isAr ? 'عرضي' : 'Offre'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Empty / Welcome state ──────────────────────────────────────── */}
        {messages.length === 0 ? (
          <FlatList
            data={suggestions}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.emptyState}
            ListHeaderComponent={
              <View style={styles.emptyHeader}>
                <LinearGradient
                  colors={CHAT_GRADIENT}
                  style={styles.emptyAvatarCircle}
                >
                  <Text style={{ fontSize: 36 }}>{CHAT_EMOJI}</Text>
                </LinearGradient>
                <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>
                  {isAr ? 'مرحباً 👋' : 'Bienvenue 👋'}
                </Text>
                <Text style={[styles.emptySub, { color: C.textSecondary }]}>
                  {isAr
                    ? (catalogPlanNameFr
                      ? `عرضك الحالي: ${catalogPlanNameFr}. اسأل ما تشاء وسنساعدك خطوة بخطوة.`
                      : 'اسأل ما تشاء وسنساعدك خطوة بخطوة.')
                    : (catalogPlanNameFr
                      ? `Forfait : ${catalogPlanNameFr}. Pose ta question et on t’aide pas à pas.`
                      : 'Pose ta question et on t’aide pas à pas.')}
                </Text>
                <View style={styles.emptyActionsCol}>
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => (navigation as any).navigate('Paywall')}
                    style={styles.emptyCtaPrimaryWrap}
                  >
                    <LinearGradient
                      colors={['#4F46E5', '#7C3AED']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.emptyCtaPrimary}
                    >
                      <AppIcon name='sparkles' size={18} color="#fff" />
                      <Text style={styles.emptyCtaPrimaryText}>
                        {isAr ? 'Studara+ — عرض شهري' : 'Studara+ — offre mensuelle'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => (navigation as any).navigate('MyPlan')}
                    style={styles.emptyCtaSecondary}
                    hitSlop={{ top: 8, bottom: 8 }}
                  >
                    <Text style={[styles.emptyCtaSecondaryText, { color: C.textSecondary }]}>
                      {isAr ? 'عرضي والحدود' : 'Voir mon offre et les limites'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.suggestionsLabel, { color: C.textSecondary }]}>
                  {isAr ? '✨ جرّب هذه الأسئلة' : '✨ Essaie ces questions'}
                </Text>
              </View>
            }
            renderItem={({ item: s }) => (
              <TouchableOpacity
                style={[
                  styles.suggestionChip,
                  { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
                  Platform.OS === 'ios' ? Shadows.xs : { elevation: 1 },
                ]}
                onPress={() => sendMessage(s.text)}
                activeOpacity={0.75}
              >
                <Text style={styles.suggestionIcon}>{s.icon}</Text>
                <Text style={[styles.suggestionText, { color: C.textPrimary }]}>{s.text}</Text>
                <AppIcon name="arrowForward" size={14} color={CHAT_GRADIENT[0]} />
              </TouchableOpacity>
            )}
          />
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Typing indicator */}
        {loading && (
          <View style={styles.loadingRow}>
            <View style={[styles.botAvatar, { backgroundColor: CHAT_GRADIENT[0] + '25' }]}>
              <Text style={{ fontSize: 17 }}>{CHAT_EMOJI}</Text>
            </View>
            <View style={[styles.typingBubble, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
              <TypingDots color={CHAT_GRADIENT[0]} />
            </View>
          </View>
        )}

        {/* ── Input bar ────────────────────────────────────────────────────── */}
        <View style={[styles.inputBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          {/* Text input */}
          <View style={[styles.inputWrap, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <TextInput
              style={[styles.input, { color: C.textPrimary }]}
              value={input}
              onChangeText={setInput}
              placeholder={isAr ? 'اسألني أي شيء...' : 'Pose ta question...'}
              placeholderTextColor={C.textSecondary}
              multiline
              maxLength={1500}
              textAlign={isAr ? 'right' : 'left'}
              returnKeyType='send'
              onSubmitEditing={() => sendMessage(input)}
            />
          </View>

          {/* Send button — standalone, always on trailing edge */}
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: (!input.trim() || loading) ? C.border : CHAT_GRADIENT[0] }]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <AppIcon name={isAr ? 'arrowBack' : 'arrowForward'} size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (C: any, isDark: boolean) => StyleSheet.create({
  // ── Header ──
  headerGradient: {},
  headerSafe: { backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  backBtn: { padding: 4, marginEnd: 2, flexShrink: 0 },
  headerToolsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  headerToolHit: { padding: 7, borderRadius: BorderRadius.pill },
  headerToolDivider: {
    width: StyleSheet.hairlineWidth * 2,
    minWidth: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    marginRight: 4,
  },
  headerTextCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
  headerAvatarWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#4ADE80', borderWidth: 2, borderColor: 'white',
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 10, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  clearBtn: { padding: 6, flexShrink: 0 },
  creditsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  creditsText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  // ── Credit bar ──
  creditBarWrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creditBarTrack: { flex: 1, height: 6, borderRadius: BorderRadius.pill, overflow: 'hidden' },
  creditBarFill: { height: 6, borderRadius: BorderRadius.pill },
  creditBarLabel: { fontSize: 11, fontWeight: '700', minWidth: 70, textAlign: 'right' },

  // ── Empty state ──
  emptyState: { padding: Spacing.md, paddingTop: Spacing.lg },
  emptyHeader: { alignItems: 'center', paddingBottom: 8 },
  emptyAvatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 20, paddingHorizontal: 16 },

  // ── Suggestion chips ──
  emptyActionsCol: {
    width: '100%',
    marginBottom: 22,
    gap: 10,
    alignItems: 'stretch',
  },
  emptyCtaPrimaryWrap: { borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadows.sm },
  emptyCtaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  emptyCtaPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  emptyCtaSecondary: { alignItems: 'center', paddingVertical: 4 },
  emptyCtaSecondaryText: { fontSize: 14, fontWeight: '600' },

  suggestionsLabel: { fontSize: 12, fontWeight: '600', alignSelf: 'flex-start', marginBottom: 10, letterSpacing: 0.2 },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 0,
  },
  suggestionIcon: { fontSize: 18 },
  suggestionText: { flex: 1, fontSize: 14, lineHeight: 20 },

  // ── Messages ──
  messagesList: { padding: Spacing.md, paddingBottom: 8 },
  msgRowUser: { flexDirection: 'row-reverse', marginBottom: 16, alignItems: 'flex-end' },
  msgRowBot: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  botAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 6, flexShrink: 0,
  },
  userBubbleWrap: { maxWidth: '78%', alignItems: 'flex-end', gap: 4 },
  botBubbleWrap: { maxWidth: '78%', gap: 4 },
  modelTag: { fontSize: 11, fontWeight: '700', marginLeft: 4 },
  bubbleUser: { borderRadius: 20, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleBot: { borderRadius: 20, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleTextUser: { color: '#fff', fontSize: 15, lineHeight: 22 },
  bubbleTextBot: { fontSize: 15, lineHeight: 22 },
  timestamp: { fontSize: 10, color: C.textSecondary, marginHorizontal: 4 },

  // ── Loading / typing ──
  loadingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, marginBottom: 8 },
  typingBubble: {
    borderRadius: 20, borderBottomLeftRadius: 4,
    paddingHorizontal: 16, paddingVertical: 10,
  },

  // ── Input bar ──
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderTopWidth: 1, gap: 10,
  },
  modelBtn: {
    width: 48, height: 48, borderRadius: 24,
    overflow: 'visible', flexShrink: 0,
    position: 'relative',
  },
  modelBtnGradient: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modelBtnBadge: {
    position: 'absolute', bottom: -2, end: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: isDark ? '#0F172A' : '#fff',
  },
  modelBtnBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  inputWrap: {
    flex: 1, borderRadius: 24, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 10,
    minHeight: 48, justifyContent: 'center',
  },
  input: { fontSize: 15, maxHeight: 120, paddingVertical: 0 },
  sendBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: 36,
    gap: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  sheetTitleHint: { fontSize: 12, textAlign: 'center', marginTop: -4, marginBottom: 4 },
  sheetSub: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  creditsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  creditsLabel: { fontSize: 13, fontWeight: '600' },
  progressBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: 6, borderRadius: 3 },

  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  modelCardIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelCardName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  modelCardTagline: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  costPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
  },
  costPillText: { fontSize: 11, fontWeight: '700' },
  selectedDot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  upgradeBannerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBannerMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  upgradeBannerTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  upgradeBannerSub: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  upgradeBannerSideBtn: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
    ...Shadows.xs,
  },
  upgradeBannerSideBtnText: { fontSize: 12, fontWeight: '700' },

  modalSubscribeBtn: {
    marginTop: 8,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  modalSubscribeBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  modalSubscribeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
});
