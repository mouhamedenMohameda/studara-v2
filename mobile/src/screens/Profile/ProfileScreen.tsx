import React, { useState, useEffect, useMemo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { Faculty, University, ProfileStackParamList } from '../../types';
import { FACULTIES, UNIVERSITIES } from '../../constants';
import { apiRequest } from '../../utils/api';
import { queryKeys } from '../../utils/queryKeys';
import { useFaculties } from '../../hooks/useFaculties';
import {
  FacultyOrInstitut,
  Filiere,
  UniversityNode,
} from '../../constants/academicStructure';
import { useAcademicStructure } from '../../hooks/useAcademicStructure';
import {
  isBiometricAvailable, isBiometricEnabled,
  clearBiometricCredentials, biometricLabel,
} from '../../utils/biometricAuth';
import { useAccessibility } from '../../context/AccessibilityContext';
import { getDailyStudyGoal, setDailyStudyGoal, getSessionsCompleted, getStudyStreak } from '../../utils/offlineStorage';

type Nav = StackNavigationProp<ProfileStackParamList, 'ProfileMain'>;

const YEARS = ['1', '2', '3', '4', '5', '6', '7'];

const LEVEL_LABELS: Record<number, { fr: string; ar: string; emoji: string; color: string }> = {
  1: { fr: 'Débutant',      ar: 'مبتدئ',     emoji: '🥉', color: '#92400E' },
  2: { fr: 'Intermédiaire', ar: 'متوسط',     emoji: '🥈', color: '#6B7280' },
  3: { fr: 'Avancé',        ar: 'متقدم',     emoji: '🥇', color: '#B45309' },
  4: { fr: 'Expert',        ar: 'خبير',      emoji: '💎', color: '#0891B2' },
  5: { fr: 'Maître',        ar: 'أستاذ',     emoji: '👑', color: '#7C3AED' },
};

const getLevelInfo = (level: number) => LEVEL_LABELS[Math.min(level, 5)] ?? LEVEL_LABELS[1];

const ProfileScreen = () => {
  const { user, logout, updateUser, token, refreshUserFromServer } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const { subscription, daysLeft, status: subStatus, catalogPlanNameFr } = useSubscription();
  const { fontScalePref, setFontScale } = useAccessibility();
  const { colors: C, isDark, toggleTheme } = useTheme();
  const navigation = useNavigation<Nav>();
  const isAr = lang === 'ar';
  const { structure, getUniversity: getUniv, getFacultyOrInstitut: getFac } = useAcademicStructure();

  const styles = useMemo(() => makeStyles(C), [C]);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [editName, setEditName] = useState(user?.fullName || '');
  const [editFaculty, setEditFaculty] = useState<string>(user?.faculty || '');
  const [editYear, setEditYear] = useState<string>(String(user?.year || '1'));
  const [editUniversity, setEditUniversity] = useState<string>(user?.university || '');

  // ── 3-level cascade for speciality change request ──────────────
  const [editSelectedUniv, setEditSelectedUniv] = useState<UniversityNode | null>(null);
  const [editSelectedFac,  setEditSelectedFac]  = useState<FacultyOrInstitut | null>(null);
  const [editSelectedFil,  setEditSelectedFil]  = useState<Filiere | null>(null);
  const pickEditUniv = (u: UniversityNode) => { setEditSelectedUniv(u); setEditSelectedFac(null); setEditSelectedFil(null); };
  const pickEditFac  = (f: FacultyOrInstitut) => {
    setEditSelectedFac(f);
    setEditSelectedFil(null);
    // Reset year to 1 when switching faculty (avoid invalid year > numYears)
    setEditYear('1');
  };

  // ── Faculty change request state ──────────────────────────────
  const [pendingChangeRequest, setPendingChangeRequest] = useState<{
    id: string; status: string; new_faculty?: string; new_university?: string;
    new_filiere?: string; new_year?: number; admin_note?: string;
  } | null>(null);
  const [showChangeForm,   setShowChangeForm]   = useState(false);
  const [requestSaving,    setRequestSaving]    = useState(false);

  // ── Biometric state ──────────────────────────────────────────
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled,   setBioEnabled]   = useState(false);
  const [bioLbl,       setBioLbl]       = useState('البصمة');
  // ── Daily Goal state ───────────────────────────────
  const [dailyGoal, setDailyGoalState] = useState(20);
  // ── Sessions count (for share card) ───────────────
  const [sessionsCount, setSessionsCount] = useState(0);

  useEffect(() => {
    getDailyStudyGoal().then(setDailyGoalState).catch(() => {});
    getSessionsCompleted().then(setSessionsCount).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    apiRequest('/auth/me/faculty-change-status', { token })
      .then(async (data: any) => {
        setPendingChangeRequest(data);
        if (data?.status === 'approved') {
          await refreshUserFromServer();
        }
      })
      .catch(() => {});
  }, [token]);

  const handleGoalChange = async (g: number) => {
    setDailyGoalState(g);
    await setDailyStudyGoal(g);
  };

  // ── Bento Box Share Card ───────────────────────────
  const handleShareCard = async () => {{
    const localStreak = await getStudyStreak().catch(() => 0);
    const sessions = await getSessionsCompleted().catch(() => 0);
    const lvl = xpData?.level ?? user?.level ?? 1;
    const levelInfo = getLevelInfo(lvl);
    const facultyName = user?.faculty ?? '';

    const card = [
      '╔══════════════════════════════╗',
      '   📚 Studara — بطاقة الطالب',
      '═══════════════════════════════',
      `   ${user?.fullName ?? ''}`,
      `   ${facultyName} • السنة ${user?.year ?? ''}`,
      '───────────────────────────────',
      `   ${levelInfo.emoji} مستوى ${lvl}  ·  ${xp} XP`,
      `   🔥 ${Math.max(localStreak, streak)} يوم متواصل`,
      `   🃏 ${sessions} جلسة مراجعة`,
      `   📂 ${user?.totalUploads ?? 0} مورد مشترك`,
      '───────────────────────────────',
      '   studara.app',
      '╚══════════════════════════════╝',
    ].join('\n');

    Share.share({
      message: card,
      title: 'بطاقة Studara',
    }).catch(() => {});
  }};

  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable();
      const enabled   = await isBiometricEnabled();
      const label     = await biometricLabel(lang as 'ar' | 'fr' | 'en');
      setBioAvailable(available);
      setBioEnabled(enabled);
      setBioLbl(label);
    })();
  }, [lang]);

  const handleBioToggle = async (value: boolean) => {
    if (!value) {
      Alert.alert(
        isAr ? 'تعطيل البصمة' : `Désactiver ${bioLbl}`,
        isAr ? 'هل تريد حذف بيانات التسجيل المحفوظة؟' : 'Supprimer les identifiants sauvegardés ?',
        [
          { text: isAr ? 'إلغاء' : 'Annuler', style: 'cancel' },
          { text: isAr ? 'حذف' : 'Supprimer', style: 'destructive', onPress: async () => {
            await clearBiometricCredentials();
            setBioEnabled(false);
          }},
        ]
      );
    } else {
      Alert.alert(
        isAr ? 'البصمة' : bioLbl,
        isAr ? 'سجّل الدخول مرة واحدة يدوياً وسيُطلب منك تفعيلها عند تسجيل الدخول التالي.' : `Connectez-vous manuellement une fois et activez ${bioLbl} à ce moment-là.`
      );
    }
  };

  // Fetch faculties from DB (public endpoint, no token)
  const facultiesList = useFaculties();

  // Fetch live XP data (also updates badges)
  const { data: xpData } = useQuery<{
    xp: number; level: number; streakDays: number;
    badges: { id: string; emoji: string; color: string; nameAr: string; nameFr: string }[];
  }>({
    queryKey: queryKeys.xp(),
    queryFn:  () => apiRequest('/xp', { token }),
    staleTime: 60 * 1000,
    enabled: !!user && !!token,
  });

  const xp       = xpData?.xp       ?? user?.xp       ?? 0;
  const level    = xpData?.level    ?? user?.level    ?? 1;
  const streak   = xpData?.streakDays ?? user?.streakDays ?? 0;
  const earnedBadges = xpData?.badges ?? [];

  // XP needed for next level (each level = 200 XP)
  const xpForLevel    = (level - 1) * 200;
  const xpNextLevel   = level * 200;
  const xpProgress    = Math.min(1, (xp - xpForLevel) / 200);
  const levelInfo     = getLevelInfo(level);

  // Language-aware label helpers
  const facultyLabel = (f: string) => {
    const dynamic = facultiesList.find(x => x.slug === f);
    if (dynamic) return lang === 'fr' ? dynamic.name_fr : dynamic.name_ar;
    const entry = FACULTIES[f as Faculty];
    if (!entry) return f;
    return lang === 'fr' ? entry.name : entry.nameAr;
  };
  const universityLabel = (u: string) => {
    const fromStructure = structure.find(x => x.slug === u);
    if (fromStructure) return lang === 'fr' ? fromStructure.nameFr : fromStructure.nameAr;
    const entry = UNIVERSITIES[u as University];
    if (!entry) return u;
    return lang === 'fr' ? entry.name : entry.nameAr;
  };

  if (!user) return null;

  const initials = user.fullName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

  const handleSave = async () => {
    if (!editName.trim()) return Alert.alert(t('common.error'), t('profile.error.name'));
    setSaving(true);
    try {
      await updateUser({ fullName: editName.trim() });
      setEditing(false);
    } catch (e: any) {
      Alert.alert('خطأ', e.message || 'فشل حفظ التعديلات');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestChange = async () => {
    const yearChanged = editYear && editYear !== String(user?.year);
    if (!editSelectedUniv && !editSelectedFac && !editSelectedFil && !yearChanged) {
      return Alert.alert(isAr ? 'لم تغيّر شيئاً؟' : 'Aucun changement', '');
    }
    setRequestSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editSelectedUniv) body.university = editSelectedUniv.slug;
      if (editSelectedFac)  body.faculty    = editSelectedFac.slug;
      if (editSelectedFil)  body.filiere    = editSelectedFil.slug;
      if (yearChanged)      body.year       = Number(editYear);
      if (!Object.keys(body).length) {
        setShowChangeForm(false); return;
      }
      const res = await apiRequest<any>('/auth/me', { method: 'PUT', body, token });
      if (res?.facultyChangePending) {
        const status = await apiRequest<any>('/auth/me/faculty-change-status', { token });
        setPendingChangeRequest(status);
        setShowChangeForm(false);
        Alert.alert(
          isAr ? 'تم إرسال الطلب ✅' : 'Demande envoyée ✅',
          isAr ? 'سيتم مراجعته من طرف الإدارة وستُخطر عند البت.' : 'Votre demande sera examinée par un administrateur.',
        );
      }
    } catch (e: any) {
      Alert.alert('خطأ', e.message || 'حدث خطأ غير متوقع');
    } finally {
      setRequestSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('profile.logout.title'), t('profile.logout.msg'), [
      { text: t('profile.logout.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <LinearGradient
        colors={Gradients.brand as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            {/* Avatar + Level */}
            <View style={{ alignItems: 'center', gap: 4 }}>
              <View style={styles.avatarCircle}>
                <Text style={styles.initials}>{initials}</Text>
              </View>
              <View style={[styles.levelBadge, { backgroundColor: levelInfo.color + 'CC' }]}>
                <Text style={styles.levelText}>{levelInfo.emoji} {isAr ? levelInfo.ar : levelInfo.fr}</Text>
              </View>
            </View>
            <Text style={styles.userName}>{user.fullName}</Text>
            <Text style={styles.userMeta}>
              {facultyLabel(user.faculty)}  •  {t('profile.year.prefix')}{user.year}
            </Text>
            <View style={styles.universityBadge}>
              <AppIcon name="schoolOutline" size={13} color="rgba(255,255,255,0.8)" />
              <Text style={styles.universityText}>{user.university}</Text>
            </View>

            {/* XP Progress Bar */}
            <View style={styles.xpContainer}>
              <View style={styles.xpLabelRow}>
                <Text style={styles.xpLabel}>{xp} XP</Text>
                <Text style={styles.xpLabel}>{xpNextLevel} XP</Text>
              </View>
              <View style={styles.xpTrack}>
                <View style={[styles.xpFill, { width: `${xpProgress * 100}%` as any }]} />
              </View>
              <Text style={styles.xpSub}>
                {isAr ? `المستوى ${level}` : `Niveau ${level}`}
                {streak > 0 ? `  🔥 ${streak} ${isAr ? 'يوم' : 'j'}` : ''}
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <AppIcon name="cloudUploadOutline" size={22} color={Colors.primary} />
            <Text style={styles.statValue}>{user.totalUploads ?? 0}</Text>
            <Text style={styles.statLabel}>{t('profile.stats.uploads')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <AppIcon name="downloadOutline" size={22} color="#7C3AED" />
            <Text style={styles.statValue}>{user.totalDownloads ?? 0}</Text>
            <Text style={styles.statLabel}>{t('profile.stats.downloads')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <AppIcon name="bookmarkOutline" size={22} color="#D97706" />
            <Text style={styles.statValue}>{sessionsCount}</Text>
            <Text style={styles.statLabel}>{isAr ? 'جلسات' : 'Sessions'}</Text>
          </View>
        </View>

        {/* Bento Box share button */}
        <TouchableOpacity style={styles.shareCardBtn} onPress={handleShareCard} activeOpacity={0.8}>
          <AppIcon name="shareSocialOutline" size={17} color="#7C3AED" />
          <Text style={styles.shareCardText}>
            {isAr ? '🌍 شارك بطاقتك الدراسية' : '🌍 Partager ma carte Studara'}
          </Text>
          <AppIcon name="chevronForward" size={15} color="#A78BFA" />
        </TouchableOpacity>

        {/* Wrapped — seasonal recap */}
        <TouchableOpacity
          style={styles.wrappedBtn}
          onPress={() => navigation.navigate('Wrapped')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 18 }}>🎁</Text>
          <Text style={styles.wrappedBtnText}>
            {isAr ? '🎦 ملخصك الدراسي — Wrapped' : '🎦 Mon bilan Studara — Wrapped'}
          </Text>
          <AppIcon name="chevronForward" size={15} color="#E879F9" />
        </TouchableOpacity>

        {/* Billing hub (subscription + PAYG wallet) */}
        <TouchableOpacity
          style={[styles.wrappedBtn, { backgroundColor: '#7C3AED', marginTop: 12 }]}
          onPress={() => (navigation as any).navigate('BillingHub')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 18 }}>💳</Text>
          <Text style={[styles.wrappedBtnText, { color: '#FFFFFF' }]}>
            {isAr ? '💳 الدفع والاشتراكات' : '💳 Paiement & abonnements'}
          </Text>
          <AppIcon name="chevronForward" size={15} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Subscription Status */}
        {subscription && (
          <TouchableOpacity
            activeOpacity={subStatus === 'expired' ? 0.7 : 1}
            onPress={() => subStatus === 'expired' && (navigation as any).getParent()?.navigate('Paywall')}
            style={[
              styles.subBanner,
              subStatus === 'trial'   && { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
              subStatus === 'active'  && { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
              subStatus === 'expired' && { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Text style={{ fontSize: 18 }}>
                {subStatus === 'expired' ? '🔒' : subStatus === 'active' ? '✅' : '⏳'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[
                  styles.subBannerTitle,
                  subStatus === 'trial'   && { color: '#1D4ED8' },
                  subStatus === 'active'  && { color: '#065F46' },
                  subStatus === 'expired' && { color: '#B91C1C' },
                ]}>
                  {subStatus === 'trial'   ? (isAr ? 'فترة تجريبية' : 'Période d\'essai') :
                   subStatus === 'active'  ? (isAr ? 'اشتراك نشط'   : 'Abonnement actif') :
                                            (isAr ? 'الاشتراك منتهي' : 'Abonnement expiré')}
                </Text>
                <Text style={styles.subBannerSub}>
                  {catalogPlanNameFr
                    ? (isAr ? `الكتالوج: ${catalogPlanNameFr}` : `Catalogue : ${catalogPlanNameFr}`)
                    : daysLeft > 0
                      ? isAr ? `${daysLeft} يوم متبقٍ · ${subscription.bonusDays} أيام مجانية 🎁` : `${daysLeft}j restants · ${subscription.bonusDays} jours bonus 🎁`
                      : isAr ? 'انقر للاشتراك' : 'Appuyez pour vous abonner'}
                </Text>
              </View>
            </View>
            {subStatus === 'expired' && (
              <View style={styles.subBannerBadge}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                  {isAr ? 'اشترك' : 'Payer'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Gamification row: Badges + Exam Countdown */}
        <View style={styles.gamRow}>
          <TouchableOpacity style={styles.gamCard} onPress={() => navigation.navigate('Badges')}>
            <View style={[styles.gamIcon, { backgroundColor: '#FEF3C7' }]}>
              <Text style={{ fontSize: 20 }}>🏅</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gamTitle}>{isAr ? 'إنجازاتي' : 'Mes badges'}</Text>
              <Text style={styles.gamSub}>
                {earnedBadges.length > 0
                  ? `${earnedBadges.length} ${isAr ? 'مكتسبة' : 'obtenus'}`
                  : isAr ? 'لا يوجد بعد' : 'Aucun encore'}
              </Text>
            </View>
            <AppIcon name="chevronForward" size={18} color="#D1D5DB" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.gamCard} onPress={() => navigation.navigate('ExamCountdown')}>
            <View style={[styles.gamIcon, { backgroundColor: '#FEE2E2' }]}>
              <Text style={{ fontSize: 20 }}>📅</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gamTitle}>{isAr ? 'مواعيد الامتحانات' : 'Mode Examen'}</Text>
              <Text style={styles.gamSub}>{isAr ? 'تابع مواعيدك' : 'Compte à rebours'}</Text>
            </View>
            <AppIcon name="chevronForward" size={18} color="#D1D5DB" />
          </TouchableOpacity>
        </View>

        {/* Edit Profile */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('profile.title')}</Text>
            <TouchableOpacity
              onPress={() => { if (editing) handleSave(); else setEditing(true); }}
              disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              {saving && <ActivityIndicator size="small" color={Colors.primary} />}
              <Text style={styles.editToggle}>{editing ? t('profile.save') : t('profile.edit')}</Text>
            </TouchableOpacity>
          </View>

          {editing ? (
            <View style={styles.editForm}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t('profile.field.name')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editName}
                  onChangeText={setEditName}
                  textAlign="right"
                  autoCapitalize="words"
                />
              </View>

              {/* Faculty / University / Year — locked, change via request */}
              <View style={[styles.fieldRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AppIcon name="lockClosedOutline" size={14} color="#9CA3AF" />
                  <Text style={[styles.fieldLabel, { marginBottom: 0, color: '#9CA3AF' }]}>
                    {isAr ? 'التخصص / الجامعة / السنة' : 'Filière / Université / Année'}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: '#6B7280' }}>
                  {facultyLabel(user.faculty)}  •  {universityLabel(user.university)}  •  {t('profile.year.prefix')}{user.year}
                </Text>

                {/* Pending / rejected badge */}
                {pendingChangeRequest?.status === 'pending' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13 }}>⏳</Text>
                    <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '600' }}>
                      {isAr ? 'طلب تغيير معلّق — بانتظار موافقة الإدارة' : 'Changement en attente d’approbation'}
                    </Text>
                  </View>
                )}
                {pendingChangeRequest?.status === 'rejected' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13 }}>❌</Text>
                    <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600' }}>
                      {isAr ? 'رُفض الطلب' : 'Demande refusée'}
                      {pendingChangeRequest.admin_note ? ` — ${pendingChangeRequest.admin_note}` : ''}
                    </Text>
                  </View>
                )}

                {/* Request change button (only if no pending request) */}
                {pendingChangeRequest?.status !== 'pending' && !showChangeForm && (
                  <TouchableOpacity
                    onPress={() => setShowChangeForm(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                  >
                    <AppIcon name="swapHorizontalOutline" size={15} color="#7C3AED" />
                    <Text style={{ fontSize: 13, color: '#7C3AED', fontWeight: '600' }}>
                      {isAr ? 'طلب تغيير التخصص' : 'Demander un changement'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Inline change-request form */}
                {showChangeForm && (
                  <View style={{ width: '100%', gap: 10, marginTop: 4 }}>

                    {/* Level 1 — University */}
                    <Text style={[styles.fieldLabel, { color: '#7C3AED' }]}>
                      {isAr ? '١. الجامعة' : '1. Université'}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {structure.map(u => (
                        <TouchableOpacity
                          key={u.slug}
                          style={[styles.chip, editSelectedUniv?.slug === u.slug && styles.chipActive]}
                          onPress={() => pickEditUniv(u)}
                        >
                          <Text style={[styles.chipText, editSelectedUniv?.slug === u.slug && styles.chipTextActive]}>
                            {isAr ? u.nameAr : u.nameFr}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Level 2 — Faculty / Institut */}
                    {editSelectedUniv && (
                      <>
                        <Text style={[styles.fieldLabel, { color: '#7C3AED' }]}>
                          {isAr ? '٢. الكلية / المعهد' : '2. Faculté / Institut'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                          {editSelectedUniv.faculties.map(f => (
                            <TouchableOpacity
                              key={f.slug}
                              style={[styles.chip, editSelectedFac?.slug === f.slug && styles.chipActive]}
                              onPress={() => pickEditFac(f)}
                            >
                              <Text style={[styles.chipText, editSelectedFac?.slug === f.slug && styles.chipTextActive]}>
                                {f.type === 'institute' ? '🏛️ ' : f.type === 'preparatory' ? '🎓 ' : ''}
                                {isAr ? f.nameAr : f.nameFr}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </>
                    )}

                    {/* Level 3 — Filière */}
                    {editSelectedFac && (
                      <>
                        <Text style={[styles.fieldLabel, { color: '#7C3AED' }]}>
                          {isAr ? '٣. الشعبة (الفيلير)' : '3. Filière'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                          {editSelectedFac.filieres.map(fil => (
                            <TouchableOpacity
                              key={fil.slug}
                              style={[styles.chip, editSelectedFil?.slug === fil.slug && styles.chipActive]}
                              onPress={() => setEditSelectedFil(fil)}
                            >
                              <Text style={[styles.chipText, editSelectedFil?.slug === fil.slug && styles.chipTextActive]}>
                                {isAr ? fil.nameAr : fil.nameFr}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </>
                    )}

                    {/* Year */}
                    <Text style={[styles.fieldLabel, { color: '#7C3AED' }]}>
                      {isAr ? 'السنة' : 'Année'}
                    </Text>
                    <View style={styles.yearRow}>
                      {Array.from(
                        { length: editSelectedFac?.numYears ?? 7 },
                        (_, i) => String(i + 1)
                      ).map(y => (
                        <TouchableOpacity
                          key={y}
                          style={[styles.yearCircle, editYear === y && styles.yearCircleActive]}
                          onPress={() => setEditYear(y)}
                        >
                          <Text style={[styles.yearText, editYear === y && styles.yearTextActive]}>{y}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Action buttons */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={handleRequestChange}
                        disabled={requestSaving}
                        style={{ flex: 1, backgroundColor: '#7C3AED', borderRadius: 10,
                          paddingVertical: 10, alignItems: 'center', flexDirection: 'row',
                          justifyContent: 'center', gap: 6 }}
                      >
                        {requestSaving && <ActivityIndicator size="small" color="#fff" />}
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                          {isAr ? 'إرسال الطلب' : 'Envoyer la demande'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setShowChangeForm(false)}
                        style={{ paddingHorizontal: 14, borderRadius: 10, borderWidth: 1,
                          borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: '#6B7280', fontSize: 13 }}>{isAr ? 'إلغاء' : 'Annuler'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.infoList}>
              <InfoRow icon='personOutline'   label={t('profile.field.name')}        value={user.fullName} />
              <InfoRow
                icon='mailOutline'
                label={t('profile.field.email')}
                value={user.email}
                badge={
                  (user.isVerified || user.email.endsWith('.mr'))
                    ? (isAr ? '✅ طالب موثق' : '✅ Étudiant vérifié')
                    : undefined
                }
              />
              <InfoRow icon='schoolOutline'   label={t('profile.field.university')}  value={universityLabel(user.university)} />
              <InfoRow icon='libraryOutline'  label={t('profile.field.faculty')}     value={facultyLabel(user.faculty)} />
              <InfoRow icon='calendarOutline' label={t('profile.field.year')}        value={`${t('profile.year.prefix')}${user.year}`} />
            </View>
          )}
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>{t('profile.settings')}</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#FEF3C7' }]}>
                <AppIcon name="notificationsOutline" size={17} color="#D97706" />
              </View>
              <Text style={styles.settingLabel}>{t('profile.notifications')}</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#E5E7EB', true: Colors.primary + '55' }}
              thumbColor={notificationsEnabled ? Colors.primary : '#9CA3AF'}
            />
          </View>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#EDE9FE' }]}>
                <AppIcon name="languageOutline" size={17} color="#7C3AED" />
              </View>
              <Text style={styles.settingLabel}>{t('profile.language')}</Text>
            </View>
            <View style={styles.langToggle}>
              {(['ar', 'fr', 'en', 'es'] as const).map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.langBtn, lang === l && styles.langBtnActive]}
                  onPress={() => setLang(l)}
                >
                  <Text style={[styles.langText, lang === l && { color: '#fff' }]}>
                    {l.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Biometric row — shown only if hardware supports it */}
          {bioAvailable && (
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: '#ECFDF5' }]}>
                  <AppIcon name="fingerPrint" size={17} color={Colors.primary} />
                </View>
                <Text style={styles.settingLabel}>{isAr ? `تسجيل بـ${bioLbl}` : bioLbl}</Text>
              </View>
              <Switch
                value={bioEnabled}
                onValueChange={handleBioToggle}
                trackColor={{ false: '#E5E7EB', true: Colors.primary + '55' }}
                thumbColor={bioEnabled ? Colors.primary : '#9CA3AF'}
              />
            </View>
          )}

          {/* Font size row */}
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#F0FDF4' }]}>
                <AppIcon name="textOutline" size={17} color={Colors.primary} />
              </View>
              <Text style={styles.settingLabel}>{isAr ? 'حجم الخط' : 'Taille du texte'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['small', 'normal', 'large'] as const).map((s, i) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.fontSizeBtn, fontScalePref === s && styles.fontSizeBtnActive]}
                  onPress={() => setFontScale(s)}
                >
                  <Text style={{
                    fontSize: 10 + i * 2,
                    fontWeight: '800',
                    color: fontScalePref === s ? '#fff' : Colors.textSecondary,
                  }}>A</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Daily Study Goal row */}
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#FFFBEB' }]}>
                <AppIcon name="flagOutline" size={17} color="#CA8A04" />
              </View>
              <Text style={styles.settingLabel}>
                {isAr ? 'هدف يومي' : 'Objectif quotidien'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[10, 20, 30].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.goalBtn, dailyGoal === g && styles.goalBtnActive]}
                  onPress={() => handleGoalChange(g)}
                >
                  <Text style={[styles.goalBtnText, dailyGoal === g && { color: '#fff' }]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Dark Mode row */}
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: isDark ? '#1C1C2E' : '#F0F0FF' }]}>
                <AppIcon name={isDark ? 'moon' : 'sunnyOutline'} size={17} color={isDark ? '#818CF8' : '#F59E0B'} />
              </View>
              <Text style={styles.settingLabel}>{isAr ? 'الوضع الليلي' : 'Mode sombre'}</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#E5E7EB', true: '#818CF8' + '80' }}
              thumbColor={isDark ? '#818CF8' : '#9CA3AF'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>
            {isAr ? '🎁 دعوة صديق' : '🎁 Parrainage'}
          </Text>
          <Text style={styles.referralSubtitle}>
            {isAr
              ? 'شارك كودك الخاص — عندما يشحن صديقك لأول مرة (50 MRU على الأقل)، تحصل على ضعف مبلغه في رصيدك (حد أقصى 150 MRU)، صالح 45 يوم.'
              : "Partagez votre code — quand votre filleul effectue sa 1ère recharge (≥ 50 MRU), vous recevez le double sur votre portefeuille (max 150 MRU), valable 45 jours."}
          </Text>
          <View style={styles.referralBox}>
            <Text style={styles.referralCode}>
              {user.id.replace(/-/g, '').slice(0, 8).toUpperCase()}
            </Text>
            <TouchableOpacity
              style={styles.referralShareBtn}
              activeOpacity={0.8}
              onPress={() => {
                const code = user.id.replace(/-/g, '').slice(0, 8).toUpperCase();
                Share.share({
                  message: isAr
                    ? `انضم إلى تطبيق Studara وادرس معي! 🎓\nاستخدم كودي ${code} عند التسجيل وعندما تشحن رصيدك لأول مرة سأحصل على ضعف مبلغك (حد أقصى 150 MRU) 🎁\nhttps://radar-mr.com`
                    : `Rejoins Studara et étudie avec moi ! 🎓\nUtilise mon code ${code} à l'inscription — à ta 1ère recharge (≥ 50 MRU) je reçois le double sur mon portefeuille (max 150 MRU) 🎁\nhttps://radar-mr.com`,
                });
              }}
            >
              <AppIcon name="shareSocialOutline" size={17} color="#fff" />
              <Text style={styles.referralShareText}>{isAr ? 'مشاركة' : 'Partager'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>{t('profile.about')}</Text>
          <AboutRow icon='informationCircleOutline' color="#2563EB" label={t('profile.version')} value="1.0.0 (Beta)" />
          <AboutRow icon='documentTextOutline' color="#6B7280" label={t('profile.terms')} onPress={() => Alert.alert(t('common.soon'), t('profile.terms'))} />
          <AboutRow icon='shieldCheckmarkOutline' color="#10B981" label={t('profile.privacy')} onPress={() => Alert.alert(t('common.soon'), t('profile.privacy'))} />
          <AboutRow icon='mailOutline' color="#D97706" label={t('profile.contact')} value="support@radar-mr.com" />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <AppIcon name="logOutOutline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>

        <Text style={styles.copyright}>© 2026 Studara · صنع في موريتانيا 🇲🇷</Text>
      </ScrollView>
    </View>
  );
};

const InfoRow = ({ icon, label, value, badge }: { icon: any; label: string; value: string; badge?: string }) => {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.infoRow}>
      <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
        <Text style={styles.infoValue}>{value}</Text>
        {badge && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <AppIcon name={icon} size={16} color={Colors.textMuted} />
    </View>
  );
};

const AboutRow = ({ icon, color, label, value, onPress }: any) => {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} disabled={!onPress}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: color + '18' }]}>
          <AppIcon name={icon} size={17} color={color} />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {value ? <Text style={styles.settingValue}>{value}</Text> : <AppIcon name="chevronForward" size={16} color="#D1D5DB" />}
    </TouchableOpacity>
  );
};

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  header: { paddingBottom: 40, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  headerContent: { alignItems: 'center', paddingTop: 14, paddingBottom: 8, gap: 8 },
  avatarCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.55)',
  },
  initials: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  levelBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  levelText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  userName: { fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 6, letterSpacing: -0.5 },
  userMeta: { fontSize: 13, color: 'rgba(255,255,255,0.92)', fontWeight: '600' },
  universityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, marginTop: 4,
  },
  universityText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  // XP bar
  xpContainer: { width: '90%', marginTop: 14, gap: 6 },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  xpLabel: { fontSize: 11, color: '#fff', fontWeight: '800', letterSpacing: 0.4 },
  xpTrack: { height: 10, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 5, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: '#FDE68A', borderRadius: 5 },
  xpSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 4, fontWeight: '700', letterSpacing: 0.3 },
  // Stats
  statsRow: {
    flexDirection: 'row', backgroundColor: C.surface,
    marginHorizontal: 16, marginTop: -26, borderRadius: 22,
    padding: 18, ...Shadows.md, alignItems: 'center',
    borderWidth: 1, borderColor: C.borderLight,
  },
  statCard: { flex: 1, alignItems: 'center', gap: 6 },
  statDivider: { width: 1, height: 44, backgroundColor: C.divider },
  statValue: { fontSize: 22, fontWeight: '900', color: C.textPrimary, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.3 },
  // Share card button
  shareCardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primarySurface,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: Colors.primarySoft,
  },
  shareCardText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.primary },
  wrappedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E003D', marginHorizontal: 16, marginTop: 8,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
  },
  wrappedBtnText: { flex: 1, fontSize: 14, fontWeight: '800', color: '#F0ABFC' },
  // Subscription banner
  subBanner: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1.5,
    padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  subBannerTitle: { fontSize: 13, fontWeight: '800' },
  subBannerSub: { fontSize: 12, color: C.textSecondary, marginTop: 2, fontWeight: '500' },
  subBannerBadge: { backgroundColor: Colors.error, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  // Gamification shortcuts
  gamRow: { marginHorizontal: 16, marginTop: 12, gap: 10 },
  gamCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, padding: 14, gap: 12, ...Shadows.sm, borderWidth: 1, borderColor: C.borderLight },
  gamIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gamTitle: { fontSize: 14, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.1 },
  gamSub: { fontSize: 12, color: C.textMuted, marginTop: 2, fontWeight: '500' },
  // Sections
  section: {
    backgroundColor: C.surface, marginHorizontal: 16, marginTop: 14,
    borderRadius: 22, padding: 18, ...Shadows.sm,
    borderWidth: 1, borderColor: C.borderLight,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.2 },
  editToggle: { fontSize: 14, fontWeight: '800', color: C.primary },
  editForm: { gap: 16 },
  fieldRow: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, textAlign: 'right', letterSpacing: 0.2 },
  fieldInput: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
    color: C.textPrimary, backgroundColor: C.surfaceVariant,
  },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceVariant },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, color: C.textPrimary, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  yearRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  yearCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.border, backgroundColor: C.surface },
  yearCircleActive: { backgroundColor: C.primary, borderColor: C.primary, ...Shadows.brand },
  yearText: { fontSize: 14, fontWeight: '800', color: C.textSecondary },
  yearTextActive: { color: '#fff' },
  infoList: { gap: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 13, color: C.textMuted, flex: 1, textAlign: 'right', fontWeight: '600' },
  infoValue: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  verifiedBadge: { backgroundColor: C.successSurface, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  verifiedBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.success },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 14, color: C.textPrimary, fontWeight: '600' },
  settingValue: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  langToggle: { flexDirection: 'row', borderRadius: 999, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden' },
  langBtn: { paddingHorizontal: 13, paddingVertical: 5 },
  langBtnActive: { backgroundColor: C.primary },
  langText: { fontSize: 11, fontWeight: '800', color: C.textSecondary, letterSpacing: 0.4 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, paddingVertical: 15, borderRadius: 18, borderWidth: 1.5, borderColor: C.error + '40', backgroundColor: C.errorSurface },
  logoutText: { fontSize: 15, fontWeight: '800', color: C.error, letterSpacing: 0.3 },
  copyright: { textAlign: 'center', fontSize: 12, color: C.textLight, marginTop: 20, fontWeight: '600' },
  fontSizeBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  fontSizeBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  goalBtn: { width: 38, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceVariant },
  goalBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  goalBtnText: { fontSize: 12, fontWeight: '800', color: C.textSecondary },
  referralSubtitle: { fontSize: 13, color: C.textSecondary, textAlign: 'right', marginBottom: 14, lineHeight: 20, fontWeight: '500' },
  referralBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primarySurface, borderRadius: 16,
    borderWidth: 1.5, borderColor: Colors.primarySoft,
    padding: 14, gap: 10,
  },
  referralCode: { flex: 1, fontSize: 22, fontWeight: '900', color: Colors.primaryDark, letterSpacing: 5, textAlign: 'center' },
  referralShareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10,
    ...Shadows.brand,
  },
  referralShareText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});

export default ProfileScreen;
