import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Linking, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';

import { Opportunity, OpportunitiesStackParamList } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { BorderRadius, Colors, Shadows } from '../../theme';
import { ORBIT_BAR_HEIGHT } from '../../navigation/OrbitBar';
import { safeBack } from '../../utils/safeBack';

type Route = RouteProp<OpportunitiesStackParamList, 'OpportunityDetail'>;

const TYPE_COLORS: Record<string, string> = {
  program: '#3B82F6',
  scholarship: Colors.primary,
  exchange: '#2563EB',
  internship: '#F97316',
  fellowship: '#10B981',
  grant: '#EF4444',
  summer_school: '#EAB308',
  other: '#64748B',
};

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.background,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.2 },
  backBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: C.surface,
    borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', ...Shadows.xs,
  },
  heroCard: {
    backgroundColor: C.surface, borderRadius: 22, padding: 20, marginBottom: 12,
    shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14,
    elevation: 4, borderWidth: 1, borderColor: C.borderLight,
  },
  typeBadge: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginBottom: 10 },
  typeBadgeText: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 20, fontWeight: '900', color: C.textPrimary, textAlign: 'right', lineHeight: 28, marginBottom: 6 },
  provider: { fontSize: 14, color: C.textMuted, textAlign: 'right', fontWeight: '500', marginBottom: 14 },
  accentLine: { height: 3, width: 44, borderRadius: BorderRadius.sm, alignSelf: 'flex-end' },
  infoCard: {
    backgroundColor: C.surface, borderRadius: 18, paddingVertical: 4, paddingHorizontal: 6, marginBottom: 10,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: C.borderLight,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: 10, borderRadius: 12 },
  infoRight: { flex: 1, alignItems: 'flex-end' },
  infoIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: C.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '600', color: C.textPrimary, textAlign: 'right' },
  section: {
    backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 10,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: C.borderLight,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'flex-end', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: C.textPrimary },
  sectionBody: { fontSize: 14, color: C.textSecondary, lineHeight: 24, textAlign: 'right' },
  bottomBar: {
    backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.borderLight,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14, ...Shadows.sm,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 12, borderWidth: 1.5,
  },
  secondaryBtnText: { fontWeight: '900', fontSize: 14 },
});

function InfoRowEl({ styles, icon, label, value, color }: {
  styles: ReturnType<typeof makeStyles>; icon: any; label: string; value: string; color: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRight}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      <View style={[styles.infoIcon, { backgroundColor: color + '15' }]}>
        <AppIcon name={icon} size={17} color={color} />
      </View>
    </View>
  );
}

export default function OpportunityDetailScreen() {
  const navigation = useNavigation();
  const { params: { opportunity } } = useRoute<Route>();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const typeColor = useMemo(() => TYPE_COLORS[opportunity.opportunityType] ?? '#64748B', [opportunity.opportunityType]);

  const where = [opportunity.hostCountry, opportunity.hostCity].filter(Boolean).join(' · ');
  const provider = opportunity.providerName || opportunity.hostInstitution || '';

  const openLink = (url?: string) => {
    if (!url) {
      Alert.alert(t('common.error'), t('opp.detail.no_link'));
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert(t('common.error'), t('opp.detail.open_fail')));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Opportunities' } })}
            style={styles.backBtn}
          >
            <AppIcon name="arrowBack" size={20} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('opp.detail.header')}</Text>
          <View style={{ width: 46 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '18' }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>
              {t(`opp.type.${opportunity.opportunityType}` as any)}
            </Text>
          </View>
          <Text style={styles.title}>{opportunity.title}</Text>
          {provider ? <Text style={styles.provider}>{provider}</Text> : null}
          <View style={[styles.accentLine, { backgroundColor: typeColor }]} />
        </View>

        <View style={styles.infoCard}>
          {!!where && (
            <InfoRowEl styles={styles} icon="locationOutline" label={t('opp.detail.location')} value={where} color="#3B82F6" />
          )}
          {!!opportunity.programLevel && (
            <InfoRowEl styles={styles} icon="schoolOutline" label={t('opp.detail.level')} value={opportunity.programLevel} color={typeColor} />
          )}
          {!!opportunity.programDurationText && (
            <InfoRowEl styles={styles} icon="timeOutline" label={t('opp.detail.duration')} value={opportunity.programDurationText} color={typeColor} />
          )}
          {!!opportunity.deadline && (
            <InfoRowEl styles={styles} icon="calendarOutline" label={t('opp.detail.deadline')} value={formatDate(opportunity.deadline)} color={typeColor} />
          )}
          <InfoRowEl
            styles={styles}
            icon="cashOutline"
            label={t('opp.detail.scholarship')}
            value={opportunity.hasScholarship ? t('opp.detail.scholarship_yes') : t('opp.detail.scholarship_no')}
            color={opportunity.hasScholarship ? '#10B981' : C.textMuted}
          />
          {!!opportunity.hasScholarship && !!opportunity.scholarshipDetails && (
            <View style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
              <Text style={{ fontSize: 12, color: C.textSecondary, textAlign: 'right' }}>{opportunity.scholarshipDetails}</Text>
            </View>
          )}
          <InfoRowEl styles={styles} icon="timeOutline" label={t('opp.detail.published')} value={formatDate(opportunity.createdAt)} color="#6B7280" />
        </View>

        {!!opportunity.benefits && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppIcon name="cashOutline" size={15} color={C.primary} />
              <Text style={styles.sectionTitle}>{t('opp.detail.benefits')}</Text>
            </View>
            <Text style={styles.sectionBody}>{opportunity.benefits}</Text>
          </View>
        )}

        {!!opportunity.eligibility && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppIcon name="checkmarkCircleOutline" size={15} color={C.primary} />
              <Text style={styles.sectionTitle}>{t('opp.detail.eligibility')}</Text>
            </View>
            <Text style={styles.sectionBody}>{opportunity.eligibility}</Text>
          </View>
        )}

        {!!opportunity.description && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppIcon name="documentTextOutline" size={15} color={C.primary} />
              <Text style={styles.sectionTitle}>{t('opp.detail.description')}</Text>
            </View>
            <Text style={styles.sectionBody}>{opportunity.description}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12), marginBottom: ORBIT_BAR_HEIGHT }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: C.primary }]}
          onPress={() => openLink(opportunity.applyUrl || opportunity.officialUrl)}
          activeOpacity={0.85}
        >
          <AppIcon name="openOutline" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>{t('opp.detail.apply')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: typeColor, backgroundColor: C.surface }]}
          onPress={() => openLink(opportunity.officialUrl || opportunity.applyUrl)}
          activeOpacity={0.85}
        >
          <AppIcon name="shieldCheckmarkOutline" size={18} color={typeColor} />
          <Text style={[styles.secondaryBtnText, { color: typeColor }]}>{t('opp.detail.official')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
