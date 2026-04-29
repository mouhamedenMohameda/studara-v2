import React, { useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useQuery } from '@tanstack/react-query';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../utils/queryKeys';
import { Badge, ProfileStackParamList } from '../../types';
import { safeBack } from '../../utils/safeBack';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Shadows, BorderRadius, Gradients } from '../../theme';
import { useLanguage } from '../../context/LanguageContext';

type Nav = StackNavigationProp<ProfileStackParamList, 'Badges'>;

const BadgesScreen = () => {
  const { lang, t } = useLanguage();
  const navigation = useNavigation<Nav>();
  const { token } = useAuth();

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

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
            <TouchableOpacity onPress={() => safeBack(navigation)} style={styles.backBtn}>
              <AppIcon name="chevronBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              🏅 {t('badges.title')}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.headerStats}>
            <View style={styles.statPill}>
              <Text style={styles.statNum}>{earned.length}</Text>
              <Text style={styles.statLbl}>{t('badges.earned_label')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statPill}>
              <Text style={styles.statNum}>{badges.length}</Text>
              <Text style={styles.statLbl}>{t('badges.total_label')}</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <FlatList
        data={[...earned, ...locked]}
        keyExtractor={b => b.id}
        renderItem={renderBadge}
        numColumns={3}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          earned.length > 0 ? (
            <Text style={styles.sectionLabel}>
              {t('badges.earned_section')} ({earned.length})
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <Text style={{ fontSize: 48 }}>🏅</Text>
            <Text style={{ fontSize: 16, color: Colors.textMuted, marginTop: 12 }}>
              {t('badges.empty')}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: { paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 19, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  headerStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingBottom: 4 },
  statPill: { alignItems: 'center' },
  statNum: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.6 },
  statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.92)', fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.35)' },
  grid: { padding: 16, paddingBottom: 120 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginBottom: 12, letterSpacing: 0.3 },
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
