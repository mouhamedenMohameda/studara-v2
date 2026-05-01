import React, { useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useQuery } from '@tanstack/react-query';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../utils/queryKeys';
import { Badge, ProfileStackParamList } from '../../types';
import { safeBack } from '../../utils/safeBack';
import { Colors, Shadows, BorderRadius } from '../../theme';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

type Nav = StackNavigationProp<ProfileStackParamList, 'Badges'>;

const BadgesScreen = () => {
  const { lang, t } = useLanguage();
  const navigation = useNavigation<Nav>();
  const { token } = useAuth();
  const { colors: C, isDark } = useTheme();

  const { data: badges = [], isLoading } = useQuery<Badge[]>({
    queryKey: queryKeys.badges(),
    queryFn: () => apiRequest<Badge[]>('/xp/badges', { token: token ?? '' }),
    staleTime: 5 * 60 * 1000,
  });

  const earned  = badges.filter(b => b.earned);
  const locked  = badges.filter(b => !b.earned);

  const renderBadge = useCallback(({ item }: { item: Badge }) => {
    const name = lang === 'ar' ? item.nameAr : item.nameFr;
    return (
      <View style={[styles.badgeCard, !item.earned && styles.badgeLocked]}>
        <View style={[styles.badgeEmoji, { backgroundColor: item.earned ? item.color + '22' : '#F3F4F6' }]}>
          <Text style={[styles.emojiText, !item.earned && styles.emojiLocked]}>
            {item.earned ? item.emoji : '🔒'}
          </Text>
        </View>
        <Text style={[styles.badgeName, !item.earned && styles.badgeNameLocked]} numberOfLines={2}>
          {name}
        </Text>
        {item.earned && item.earnedAt && (
          <Text style={styles.earnedDate}>
            {new Date(item.earnedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'fr-FR', { day: 'numeric', month: 'short' })}
          </Text>
        )}
        {!item.earned && (
          <Text style={styles.lockedHint}>+{item.xpReward} XP</Text>
        )}
      </View>
    );
  }, [lang]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => safeBack(navigation)} style={[styles.backBtn, { backgroundColor: C.surface, borderColor: C.border }]}>
            <AppIcon name="chevronBack" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.textPrimary }]}>{'🏅 '}{t('badges.title')}</Text>
          <View style={{ width: 46 }} />
        </View>
        <View style={[styles.headerStatsWrap, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]}>
          <View style={styles.statPill}>
            <Text style={[styles.statNum, { color: C.primary }]}>{earned.length}</Text>
            <Text style={[styles.statLbl, { color: C.textSecondary }]}>{t('badges.earned_label')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: C.border }]} />
          <View style={styles.statPill}>
            <Text style={[styles.statNum, { color: C.textPrimary }]}>{badges.length}</Text>
            <Text style={[styles.statLbl, { color: C.textSecondary }]}>{t('badges.total_label')}</Text>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={[...earned, ...locked]}
        keyExtractor={b => b.id}
        renderItem={renderBadge}
        numColumns={3}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          earned.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t('badges.earned_section')} ({earned.length})
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <Text style={{ fontSize: 48 }}>🏅</Text>
            <Text style={{ fontSize: 16, color: C.textMuted, marginTop: 12 }}>
              {t('badges.empty')}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    ...Shadows.xs,
  },
  headerTitle: { fontSize: 19, fontWeight: '900', letterSpacing: -0.3, flex: 1, textAlign: 'center' },
  headerStatsWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28,
    marginHorizontal: 16, paddingVertical: 14, paddingHorizontal: 20, borderRadius: BorderRadius.card,
    borderWidth: 1, marginBottom: 8,
    ...Shadows.xs,
  },
  statPill: { alignItems: 'center' },
  statNum: { fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  statLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 },
  statDivider: { width: 1, height: 36 },
  grid: { padding: 16, paddingBottom: 120 },
  sectionLabel: { fontSize: 13, fontWeight: '800', marginBottom: 12, letterSpacing: 0.3 },
  badgeCard: {
    flex: 1, margin: 6, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center',
    paddingVertical: 18, paddingHorizontal: 8, ...Shadows.sm,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  badgeLocked: { opacity: 0.55 },
  badgeEmoji: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emojiText: { fontSize: 28 },
  emojiLocked: { opacity: 0.5 },
  badgeName: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', lineHeight: 15 },
  badgeNameLocked: { color: Colors.textMuted },
  earnedDate: { fontSize: 10, color: Colors.primary, marginTop: 5, fontWeight: '800' },
  lockedHint: { fontSize: 10, color: Colors.warning, marginTop: 5, fontWeight: '800' },
});

export default BadgesScreen;
