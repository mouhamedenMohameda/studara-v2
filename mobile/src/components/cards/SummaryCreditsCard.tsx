import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { BorderRadius, Shadows, Spacing } from '@/theme';

export interface SummaryCreditsCardProps {
  balanceMru: number;
  balanceLoading: boolean;
  /** Coût MRU pour l’action (null = encore inconnu côté serveur) */
  chargeMru: number | null;
  basis?: 'pages' | 'words' | 'fallback' | null;
  pageCount?: number | null;
  wordCount?: number | null;
  /** Sous-titre court */
  estimateHint?: string | null;
  onRecharge: () => void;
}

function basisLabel(b: 'pages' | 'words' | 'fallback' | null | undefined): string {
  if (b === 'pages') return 'Tarif basé sur les pages';
  if (b === 'words') return 'Tarif basé sur les mots';
  if (b === 'fallback') return 'Tarif forfaitaire minimum';
  return '';
}

export default function SummaryCreditsCard({
  balanceMru,
  balanceLoading,
  chargeMru,
  basis,
  pageCount,
  wordCount,
  estimateHint,
  onRecharge,
}: SummaryCreditsCardProps) {
  const unknown = chargeMru == null;
  const sufficient = !unknown && balanceMru >= chargeMru;

  return (
    <LinearGradient
      colors={['#4C1D95', '#6D28D9', '#7C3AED']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      <View style={styles.topRow}>
        <View style={styles.pill}>
          <AppIcon name="wallet" size={18} color="#FDE68A" />
          <Text style={styles.pillLabel}>Crédits résumé IA</Text>
        </View>
        <TouchableOpacity onPress={onRecharge} style={styles.rechargeBtn} activeOpacity={0.85}>
          <Text style={styles.rechargeText}>Recharger</Text>
          <AppIcon name="chevronForward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.balanceBlock}>
        <Text style={styles.balanceCaption}>Solde disponible</Text>
        {balanceLoading ? (
          <Text style={styles.balanceMuted}>…</Text>
        ) : (
          <Text style={styles.balanceValue}>
            {balanceMru.toLocaleString('fr-FR')}
            <Text style={styles.balanceUnit}> MRU</Text>
          </Text>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.costRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.costCaption}>Coût de ce résumé</Text>
          {unknown ? (
            <Text style={styles.hint}>{estimateHint ?? 'Estimation après préparation du document…'}</Text>
          ) : (
            <>
              <Text style={styles.costValue}>
                {chargeMru!.toLocaleString('fr-FR')}
                <Text style={styles.costUnit}> MRU</Text>
              </Text>
              {basis ? <Text style={styles.basis}>{basisLabel(basis)}</Text> : null}
            </>
          )}
        </View>
        {!unknown && (
          <View style={[styles.badge, sufficient ? styles.badgeOk : styles.badgeWarn]}>
            <AppIcon name={sufficient ? 'checkmarkCircle' : 'alertCircleOutline'} size={20} color={sufficient ? '#166534' : '#9A3412'} />
            <Text style={[styles.badgeText, sufficient ? styles.badgeTextOk : styles.badgeTextWarn]}>
              {sufficient ? 'OK' : 'Insuffisant'}
            </Text>
          </View>
        )}
      </View>

      {(pageCount != null || wordCount != null) && (
        <View style={styles.metrics}>
          {pageCount != null && pageCount > 0 ? (
            <View style={styles.metricChip}>
              <Text style={styles.metricEmoji}>📄</Text>
              <Text style={styles.metricTxt}>{pageCount} p.</Text>
            </View>
          ) : null}
          {wordCount != null && wordCount > 0 ? (
            <View style={styles.metricChip}>
              <Text style={styles.metricEmoji}>📝</Text>
              <Text style={styles.metricTxt}>{wordCount.toLocaleString('fr-FR')} mots</Text>
            </View>
          ) : null}
        </View>
      )}

      <Text style={styles.footnote}>
        Grille : 0,04 MRU/page et 0,08 MRU / 1 000 mots (on applique le max), arrondi au palier de 0,2 MRU (vers le haut).
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pillLabel: { color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: '800' },
  rechargeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  rechargeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  balanceBlock: { marginBottom: 4 },
  balanceCaption: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  balanceMuted: { color: 'rgba(255,255,255,0.6)', fontSize: 22, fontWeight: '800' },
  balanceValue: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  balanceUnit: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginVertical: Spacing.md,
  },
  costRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  costCaption: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  costValue: { color: '#FDE68A', fontSize: 22, fontWeight: '900' },
  costUnit: { fontSize: 14, fontWeight: '700', color: '#FEF3C7' },
  basis: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 4, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 4,
  },
  badgeOk: { backgroundColor: '#DCFCE7' },
  badgeWarn: { backgroundColor: '#FFEDD5' },
  badgeText: { fontSize: 11, fontWeight: '900' },
  badgeTextOk: { color: '#166534' },
  badgeTextWarn: { color: '#9A3412' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.md },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  metricEmoji: { fontSize: 13 },
  metricTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  footnote: {
    marginTop: Spacing.md,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
});

