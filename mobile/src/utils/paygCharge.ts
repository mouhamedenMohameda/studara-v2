import { getPaygFeature, PaygFeatureKey, PaygPriceUnit } from '@/constants/paygFeatures';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function unitToQuantity(unit: PaygPriceUnit, params: { minutes?: number; pages?: number; uses?: number }): number {
  if (unit === 'per_minute') return Math.max(0, params.minutes ?? 0);
  if (unit === 'per_page') return Math.max(0, params.pages ?? 0);
  if (unit === 'per_1k_words') return Math.max(0, params.uses ?? 0);
  return Math.max(0, params.uses ?? 0);
}

/**
 * Returns the PAYG charge in MRU based on the centralized pricing table.
 * If a price is missing, returns 0 (so the UI won't show incorrect debits).
 */
export function computePaygChargeMru(params: {
  featureKey: PaygFeatureKey;
  modelKey?: string;
  minutes?: number;
  pages?: number;
  uses?: number;
}): number {
  const { featureKey, modelKey, minutes, pages, uses } = params;
  const feature = getPaygFeature(featureKey);
  if (!feature) return 0;

  const pricing =
    (modelKey ? feature.pricing.find((p) => p.modelKey === modelKey) : undefined)
    ?? feature.pricing.find((p) => p.modelKey === 'default')
    ?? feature.pricing[0];

  if (!pricing || pricing.priceMru == null) return 0;
  const qty = unitToQuantity(pricing.unit, { minutes, pages, uses });
  return round2(pricing.priceMru * qty);
}

