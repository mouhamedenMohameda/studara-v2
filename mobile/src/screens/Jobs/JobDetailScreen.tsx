import React, { useState, useEffect, useCallback } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Linking, Alert } from 'react-native';
import { ORBIT_BAR_HEIGHT } from '../../navigation/OrbitBar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Job, JobsStackParamList } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients } from '../../theme';
import { safeBack } from '../../utils/safeBack';
import {
  saveJobApplication, getJobApplication, removeJobApplication,
  JobApplication, JobApplicationStatus,
} from '../../utils/offlineStorage';

type Route = RouteProp<JobsStackParamList, 'JobDetail'>;

const JOB_TYPE_COLORS: Record<string, string> = {
  stage: '#8B5CF6', cdi: Colors.primary, cdd: '#3B82F6', freelance: '#F59E0B', other: '#64748B',
};
const AVATAR_PALETTE = ['#EF4444','#F97316','#EAB308','#22C55E','#14B8A6','#3B82F6','#8B5CF6','#EC4899'];
const avatarColor = (s: string) => AVATAR_PALETTE[(s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % AVATAR_PALETTE.length];

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};
const isExpiredDate = (iso?: string) => !!iso && new Date(iso).getTime() < Date.now();

// ─── Smart description formatter ─────────────────────────────────────────────

const SECTION_KEYWORDS = [
  'Description du poste', "Description de l'offre", 'Offres de Stage',
  'Profil recherch\u00e9', 'Profil Recherch\u00e9',
  '\u00c0 propos de', 'A propos de',
  'Comp\u00e9tences', 'Comp\u00e9tences requises', 'Comp\u00e9tences techniques',
  'Formation', "Niveau d'\u00e9tude", 'Exp\u00e9rience',
  'Missions', 'Vos missions', 'Votre mission', 'Responsabilit\u00e9s',
  'Avantages', 'Nous offrons', 'Ce que nous offrons',
  'Type de contrat', "Type d'offre",
  '\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u0629', '\u0627\u0644\u0645\u062a\u0637\u0644\u0628\u0627\u062a', '\u0627\u0644\u0645\u0647\u0627\u0645',
];

type DescLine = { type: 'header' | 'bullet' | 'para'; text: string };

const cleanRaw = (s: string): string => {
  // Strip JS code artifacts (share buttons etc. scraped alongside content)
  s = s.replace(/\s*\bfunction\s+\w+\s*\([\s\S]*/i, '');
  // Strip "Source : XYZ" / "Partager" chrome
  s = s.replace(/\s*\bSource\s*:\s*\w[^\n]*/gi, '');
  s = s.replace(/\s*\bPartager\b[^\n]*/gi, '');
  // Strip view counters like "Vue 42 fois"
  s = s.replace(/\bVue\s+\d+[^\n]*/gi, '');
  return s.trim();
};

const formatDescription = (raw: string): DescLine[] => {
  let s = cleanRaw(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Insert newline breaks before known section keywords that got concatenated
  for (const kw of SECTION_KEYWORDS) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // after lowercase letter / punctuation / closing paren
    s = s.replace(new RegExp(`([a-z\u00e0-\u00ff.,;:!?\u0600-\u06ff])(${esc})`, 'g'), '$1\n\n$2');
    s = s.replace(new RegExp(`(\\))(${esc})`, 'g'), '$1\n\n$2');
  }

  // Split concatenated bullets: ")Capital" → ")\nCapital"
  s = s.replace(/\)([A-Z\u00c0-\u00de][a-z\u00e0-\u00ff])/g, ')\n$1');
  // Split on ". Capital" (new sentence), but avoid short abbreviations
  s = s.replace(/([a-z\u00e0-\u00ff]{3})\.([A-Z\u00c0-\u00de][a-z\u00e0-\u00ff])/g, '$1.\n$2');

  const lines = s.split(/\n+/).map(l => l.trim()).filter(Boolean);

  return lines.map((line): DescLine => {
    if (/^[-•·\u2013*]\s+/.test(line) || /^\d+[.)\u0029]\s+/.test(line)) {
      return { type: 'bullet', text: line.replace(/^[-•·\u2013*]\s+|^\d+[.)\u0029]\s+/, '').trim() };
    }
    const isKw = SECTION_KEYWORDS.some(kw => line.toLowerCase().startsWith(kw.toLowerCase()));
    const isShortColon = line.length <= 80 && line.endsWith(':');
    if (isKw || isShortColon) {
      return { type: 'header', text: line.replace(/:$/, '').trim() };
    }
    return { type: 'para', text: line };
  });
};

const DescriptionBlock = ({ text }: { text: string }) => {
  const lines = formatDescription(text);
  return (
    <View style={{ gap: 2 }}>
      {lines.map((line, i) => {
        if (line.type === 'header') {
          return (
            <View key={i} style={descStyles.headerRow}>
              <View style={descStyles.headerBar} />
              <Text style={descStyles.headerText}>{line.text}</Text>
            </View>
          );
        }
        if (line.type === 'bullet') {
          return (
            <View key={i} style={descStyles.bulletRow}>
              <View style={descStyles.bulletDot} />
              <Text style={descStyles.bulletText}>{line.text}</Text>
            </View>
          );
        }
        return <Text key={i} style={descStyles.paraText}>{line.text}</Text>;
      })}
    </View>
  );
};

const descStyles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 4 },
  headerBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: Colors.primaryDark, flexShrink: 0 },
  headerText: { fontSize: 13, fontWeight: '800', color: Colors.primaryDark, flex: 1 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 3 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 8, flexShrink: 0 },
  bulletText: { flex: 1, fontSize: 13.5, color: '#374151', lineHeight: 21 },
  paraText: { fontSize: 13.5, color: '#475569', lineHeight: 22 },
});

const InfoRow = ({ icon, label, value, color, tag }: {
  icon: AppIconName; label: string; value: string; color: string; tag?: string;
}) => (
  <View style={styles.infoRow}>
    <View style={styles.infoRight}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
        <Text style={styles.infoValue}>{value}</Text>
        {tag && (
          <View style={[styles.infoTag, { backgroundColor: color + '18' }]}>
            <Text style={[styles.infoTagText, { color }]}>{tag}</Text>
          </View>
        )}
      </View>
    </View>
    <View style={[styles.infoIcon, { backgroundColor: color + '15' }]}>
      <AppIcon name={icon} size={17} color={color} />
    </View>
  </View>
);

export default function JobDetailScreen() {
  const navigation = useNavigation();
  const { params: { job } } = useRoute<Route>();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [application, setApplication] = useState<JobApplication | null>(null);

  useEffect(() => {
    getJobApplication(job.id).then(setApplication);
  }, [job.id]);

  const handleApplicationStatus = useCallback((status: JobApplicationStatus) => {
    if (application?.status === status) {
      // Toggle off
      removeJobApplication(job.id).then(() => setApplication(null));
      return;
    }
    const app: JobApplication = {
      jobId: job.id,
      company: job.company,
      title: job.title,
      status,
      appliedAt: application?.appliedAt ?? new Date().toISOString(),
    };
    saveJobApplication(app).then(() => setApplication(app));
  }, [application, job]);

  const JOB_TYPE_LABELS: Record<string, string> = {
    stage: t('jobs.type.stage'), cdi: t('jobs.type.cdi'), cdd: t('jobs.type.cdd'),
    freelance: t('jobs.type.freelance'), other: t('jobs.type.other'),
  };
  const DOMAIN_LABELS: Record<string, string> = {
    'Informatique':           t('jobs.domain.informatique'),
    'Ingénierie & BTP':       t('jobs.domain.ingenierie'),
    'Finance & Comptabilité': t('jobs.domain.finance'),
    'Marketing & Commercial': t('jobs.domain.marketing'),
    'Ressources Humaines':    t('jobs.domain.rh'),
    'Santé':                  t('jobs.domain.sante'),
    'Autre':                  t('jobs.domain.autre'),
  };

  const typeColor = JOB_TYPE_COLORS[job.jobType] ?? '#64748B';
  const initial   = (job.company || '?').trim().charAt(0).toUpperCase();
  const avatarBg  = avatarColor(job.company || '?');
  const expired   = isExpiredDate(job.deadline);

  const handleApply = () => {
    if (!job.applyUrl) {
      Alert.alert(t('job.detail.apply'), t('job.detail.no_apply_msg'));
      return;
    }
    Linking.openURL(job.applyUrl).catch(() => Alert.alert(t('common.error'), 'تعذّر فتح الرابط'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primaryDark} />

      <LinearGradient
        colors={['#F97316', '#EC4899', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Jobs' } })} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('job.detail.header')}</Text>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + '18' }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
              </Text>
            </View>
          </View>
          <Text style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.companyName}>{job.company}</Text>
          <View style={[styles.accentLine, { backgroundColor: typeColor }]} />
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          {!!job.location && <InfoRow icon='locationOutline' label={t('job.detail.location')} value={job.location} color="#3B82F6" />}
          {!!job.domain && <InfoRow icon='briefcaseOutline' label={t('job.detail.domain')} value={DOMAIN_LABELS[job.domain] ?? job.domain} color={typeColor} />}
          {!!job.deadline && (
            <InfoRow icon='calendarOutline' label={t('job.detail.deadline')} value={formatDate(job.deadline)}
              color={expired ? '#EF4444' : '#10B981'} tag={expired ? t('job.detail.expired_tag') : undefined} />
          )}
          <InfoRow icon='timeOutline' label={t('job.detail.published')} value={formatDate(job.createdAt)} color="#6B7280" />
        </View>

        {/* Description */}
        {!!job.description && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppIcon name="documentTextOutline" size={15} color={Colors.primaryDark} />
              <Text style={styles.sectionTitle}>{t('job.detail.description')}</Text>
            </View>
            <DescriptionBlock text={job.description} />
          </View>
        )}

        {/* Requirements */}
        {!!job.requirements && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppIcon name="checkmarkCircleOutline" size={15} color={Colors.primaryDark} />
              <Text style={styles.sectionTitle}>{t('job.detail.requirements')}</Text>
            </View>
            <DescriptionBlock text={job.requirements} />
          </View>
        )}
      </ScrollView>

      {/* Apply + Application Tracker */}
      <View style={[styles.applyBar, { paddingBottom: Math.max(insets.bottom, 12), marginBottom: ORBIT_BAR_HEIGHT }]}>
        {/* Status tracker row */}
        <View style={styles.statusRow}>
          {([
            { key: 'applied',   label: 'تقدّمت',  icon: 'sendOutline',        color: '#2563EB' },
            { key: 'interview', label: 'مقابلة',  icon: 'peopleOutline',      color: '#7C3AED' },
            { key: 'offer',     label: 'عرض',     icon: 'checkmarkCircleOutline', color: Colors.primary },
            { key: 'rejected',  label: 'رُفضت',  icon: 'closeCircleOutline', color: '#DC2626' },
          ] as { key: JobApplicationStatus; label: string; icon: AppIconName; color: string }[]).map(s => {
            const active = application?.status === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.statusBtn, active && { backgroundColor: s.color + '18', borderColor: s.color }]}
                onPress={() => handleApplicationStatus(s.key)}
                activeOpacity={0.75}
              >
                <AppIcon name={s.icon} size={15} color={active ? s.color : '#94A3B8'} />
                <Text style={[styles.statusBtnText, active && { color: s.color, fontWeight: '700' }]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: expired ? '#94A3B8' : Colors.primary }]}
          onPress={handleApply}
          activeOpacity={0.85}
        >
          <AppIcon name={expired ? 'timeOutline' : 'sendOutline'} size={18} color="#fff" />
          <Text style={styles.applyBtnText}>
            {expired ? t('job.detail.expired') : job.applyUrl ? t('job.detail.apply') : t('job.detail.no_link')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: Colors.surface, borderRadius: 22, padding: 20, marginBottom: 12,
    shadowColor: '#0F0A1F', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 14, elevation: 4,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  avatar: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 21 },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  typeBadgeText: { fontSize: 12, fontWeight: '700' },
  jobTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'right', lineHeight: 28, marginBottom: 6 },
  companyName: { fontSize: 14, color: '#64748B', textAlign: 'right', fontWeight: '500', marginBottom: 14 },
  accentLine: { height: 3, width: 44, borderRadius: 3, alignSelf: 'flex-end' },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 18, paddingVertical: 4, paddingHorizontal: 6,
    marginBottom: 10,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 12, padding: 10, borderRadius: 12,
  },
  infoRight: { flex: 1, alignItems: 'flex-end' },
  infoIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: '#94A3B8', marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1E293B', textAlign: 'right' },
  infoTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  infoTagText: { fontSize: 10, fontWeight: '700' },
  section: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'flex-end', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  sectionBody: { fontSize: 14, color: '#475569', lineHeight: 24, textAlign: 'right' },
  applyBar: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8,
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row', gap: 8, justifyContent: 'space-between',
  },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  statusBtnText: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
