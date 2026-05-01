import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { BorderRadius, Shadows, Spacing } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

export interface SummaryCreditsCardProps {
  balanceMru: number;
  balanceLoading: boolean;
  chargeMru: number | null;
  basis?: 'pages' | 'words' | 'fallback' | null;
  pageCount?: number | null;
  wordCount?: number | null;
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
  const { colors: C } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
      <View style={[styles.accentLeft, { backgroundColor: C.primary }]} />

      <View style={styles.topRow}>
        <View style={[styles.pill, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
          <AppIcon name="wallet" size={18} color={C.primary} />
          <Text style={[styles.pillLabel, { color: C.textPrimary }]}>Crédits résumé IA</Text>
        </View>
        <TouchableOpacity onPress={onRecharge} style={[styles.rechargeBtn, { backgroundColor: C.primarySurface, borderColor: C.primarySoft }]} activeOpacity={0.85}>
          <Text style={[styles.rechargeText, { color: C.primary }]}>Recharger</Text>
          <AppIcon name="chevronForward" size={16} color={C.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.balanceBlock}>
        <Text style={[styles.balanceCaption, { color: C.textMuted }]}>Solde disponible</Text>
        {balanceLoading ? (
          <Text style={[styles.balanceMuted, { color: C.textMuted }]}>…</Text>
        ) : (
          <Text style={[styles.balanceValue, { color: C.textPrimary }]}>
            {balanceMru.toLocaleString('fr-FR')}
            <Text style={[styles.balanceUnit, { color: C.textSecondary }]}> MRU</Text>
          </Text>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.borderLight }]} />

      <View style={styles.costRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.costCaption, { color: C.textMuted }]}>Coût de ce résumé</Text>
          {unknown ? (
            <Text style={[styles.hint, { color: C.textSecondary }]}>{estimateHint ?? 'Estimation après préparation du document…'}</Text>
          ) : (
            <>
              <Text style={[styles.costValue, { color: C.primary }]}>
                {chargeMru!.toLocaleString('fr-FR')}
                <Text style={[styles.costUnit, { color: C.secondaryDark }]}> MRU</Text>
              </Text>
              {basis ? <Text style={[styles.basis, { color: C.textSecondary }]}>{basisLabel(basis)}</Text> : null}
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
            <View style={[styles.metricChip, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
              <Text style={styles.metricEmoji}>📄</Text>
              <Text style={[styles.metricTxt, { color: C.textSecondary }]}>{pageCount} p.</Text>
            </View>
          ) : null}
          {wordCount != null && wordCount > 0 ? (
            <View style={[styles.metricChip, { backgroundColor: C.surfaceVariant, borderColor: C.border }]}>
              <Text style={styles.metricEmoji}>📝</Text>
              <Text style={[styles.metricTxt, { color: C.textSecondary }]}>{wordCount.toLocaleString('fr-FR')} mots</Text>
            </View>
          ) : null}
        </View>
      )}

      <Text style={[styles.footnote, { color: C.textMuted }]}>
        Grille : 0,04 MRU/page et 0,08 MRU / 1 000 mots (on applique le max), arrondi au palier de 0,2 MRU (vers le haut).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingLeft: Spacing.lg + 4,
    marginBottom: Spacing.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...Shadows.sm,
  },
  accentLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillLabel: { fontSize: 12, fontWeight: '800' },
  rechargeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  rechargeText: { fontWeight: '800', fontSize: 12 },
  balanceBlock: { marginBottom: 4 },
  balanceCaption: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  balanceMuted: { fontSize: 22, fontWeight: '800' },
  balanceValue: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  balanceUnit: { fontSize: 15, fontWeight: '700' },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  costRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  costCaption: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  costValue: { fontSize: 22, fontWeight: '900' },
  costUnit: { fontSize: 14, fontWeight: '700' },
  basis: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  metricEmoji: { fontSize: 13 },
  metricTxt: { fontSize: 12, fontWeight: '700' },
  footnote: {
    marginTop: Spacing.md,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
});
