import pool from '../../db/pool';
import {
  ActiveBooster,
  EntitlementDefinition,
  EntitlementScalar,
  SubscriptionPlan,
} from './types';

interface PlanRow {
  id: string;
  code: string;
  display_name_fr: string;
  description_fr: string;
  monthly_price_mru: string | number;
  currency_code: string;
  sort_order: string | number;
  is_active: boolean;
}

interface EntDefRow {
  key: string;
  value_type: EntitlementDefinition['valueType'];
  category: EntitlementDefinition['category'];
  reset_policy: EntitlementDefinition['resetPolicy'];
  merge_strategy: EntitlementDefinition['mergeStrategy'];
}

interface EntValueRow {
  entitlement_key: string;
  value_json: EntitlementScalar;
}

interface BoosterRow {
  id: string;
  code: string;
  display_name_fr: string;
  description_fr: string;
  price_mru: string | number;
  duration_days: string | number;
  sort_order: string | number;
  is_active: boolean;
}

interface ActiveBoosterRow {
  id: string;
  user_id: string;
  booster_id: string;
  code: string;
  display_name_fr: string;
  status: ActiveBooster['status'];
  activated_at: string;
  expires_at: string;
}

function toPlan(row: PlanRow): SubscriptionPlan {
  return {
    id: row.id,
    code: row.code,
    displayNameFr: row.display_name_fr,
    descriptionFr: row.description_fr,
    monthlyPriceMru: Number(row.monthly_price_mru),
    currencyCode: row.currency_code,
    sortOrder: Number(row.sort_order),
    isActive: row.is_active,
  };
}

export async function getSubscriptionPlans(activeOnly = true): Promise<SubscriptionPlan[]> {
  const values: unknown[] = [];
  const activeSql = activeOnly ? 'WHERE is_active = TRUE' : '';
  const { rows } = await pool.query<PlanRow>(
    `SELECT id, code, display_name_fr, description_fr, monthly_price_mru, currency_code, sort_order, is_active
     FROM subscription_plans
     ${activeSql}
     ORDER BY sort_order ASC, code ASC`,
    values,
  );
  return rows.map(toPlan);
}

export async function getPlanByCode(code: string): Promise<SubscriptionPlan | null> {
  const { rows } = await pool.query<PlanRow>(
    `SELECT id, code, display_name_fr, description_fr, monthly_price_mru, currency_code, sort_order, is_active
     FROM subscription_plans
     WHERE code = $1
     LIMIT 1`,
    [code],
  );
  return rows.length ? toPlan(rows[0]) : null;
}

export async function getBoosterDefinitions(activeOnly = true): Promise<Array<{
  id: string;
  code: string;
  displayNameFr: string;
  descriptionFr: string;
  priceMru: number;
  durationDays: number;
  sortOrder: number;
  isActive: boolean;
}>> {
  const activeSql = activeOnly ? 'WHERE is_active = TRUE' : '';
  const { rows } = await pool.query<BoosterRow>(
    `SELECT id, code, display_name_fr, description_fr, price_mru, duration_days, sort_order, is_active
     FROM booster_definitions
     ${activeSql}
     ORDER BY sort_order ASC, code ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    displayNameFr: row.display_name_fr,
    descriptionFr: row.description_fr,
    priceMru: Number(row.price_mru),
    durationDays: Number(row.duration_days),
    sortOrder: Number(row.sort_order),
    isActive: row.is_active,
  }));
}

export async function getBoosterByCode(code: string): Promise<{
  id: string;
  code: string;
  displayNameFr: string;
  descriptionFr: string;
  priceMru: number;
  durationDays: number;
  sortOrder: number;
  isActive: boolean;
} | null> {
  const { rows } = await pool.query<BoosterRow>(
    `SELECT id, code, display_name_fr, description_fr, price_mru, duration_days, sort_order, is_active
     FROM booster_definitions
     WHERE code = $1
     LIMIT 1`,
    [code],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    code: row.code,
    displayNameFr: row.display_name_fr,
    descriptionFr: row.description_fr,
    priceMru: Number(row.price_mru),
    durationDays: Number(row.duration_days),
    sortOrder: Number(row.sort_order),
    isActive: row.is_active,
  };
}

export async function getEntitlementDefinitions(): Promise<Record<string, EntitlementDefinition>> {
  const { rows } = await pool.query<EntDefRow>(
    `SELECT key, value_type, category, reset_policy, merge_strategy
     FROM entitlement_definitions`,
  );
  const map: Record<string, EntitlementDefinition> = {};
  for (const row of rows) {
    map[row.key] = {
      key: row.key,
      valueType: row.value_type,
      category: row.category,
      resetPolicy: row.reset_policy,
      mergeStrategy: row.merge_strategy,
    };
  }
  return map;
}

export async function getPlanEntitlements(planId: string): Promise<Record<string, EntitlementScalar>> {
  const { rows } = await pool.query<EntValueRow>(
    `SELECT entitlement_key, value_json
     FROM plan_entitlements
     WHERE plan_id = $1`,
    [planId],
  );
  const map: Record<string, EntitlementScalar> = {};
  for (const row of rows) map[row.entitlement_key] = row.value_json;
  return map;
}

export async function getBoosterEntitlements(boosterId: string): Promise<Record<string, EntitlementScalar>> {
  const { rows } = await pool.query<EntValueRow>(
    `SELECT entitlement_key, value_json
     FROM booster_entitlements
     WHERE booster_id = $1`,
    [boosterId],
  );
  const map: Record<string, EntitlementScalar> = {};
  for (const row of rows) map[row.entitlement_key] = row.value_json;
  return map;
}

export async function getActiveBoosters(userId: string): Promise<ActiveBooster[]> {
  const { rows } = await pool.query<ActiveBoosterRow>(
    `SELECT bp.id, bp.user_id, bp.booster_id, bd.code, bd.display_name_fr, bp.status, bp.activated_at, bp.expires_at
     FROM booster_purchases bp
     JOIN booster_definitions bd ON bd.id = bp.booster_id
     WHERE bp.user_id = $1
       AND bp.status = 'active'
       AND bp.activated_at IS NOT NULL
       AND bp.expires_at IS NOT NULL
       AND bp.expires_at > NOW()
     ORDER BY bp.expires_at ASC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    boosterId: row.booster_id,
    code: row.code,
    displayNameFr: row.display_name_fr,
    status: row.status,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
  }));
}

/** Operational overrides from `feature_flags.payload.entitlements` (kill switches, promos). */
export async function getFeatureFlagEntitlementPatches(planCode: string | null): Promise<Record<string, EntitlementScalar>> {
  try {
    const { rows } = await pool.query<{ payload: unknown }>(
      `SELECT payload FROM feature_flags
       WHERE enabled = TRUE
         AND platform IN ('all', 'mobile', 'web')
         AND (plan_code IS NULL OR ($1::text IS NOT NULL AND plan_code = $1::text))`,
      [planCode],
    );
    const out: Record<string, EntitlementScalar> = {};
    for (const row of rows) {
      const p = row.payload as Record<string, unknown> | null;
      const ent = p?.entitlements;
      if (!ent || typeof ent !== 'object' || Array.isArray(ent)) continue;
      for (const [k, v] of Object.entries(ent as Record<string, unknown>)) {
        out[k] = v as EntitlementScalar;
      }
    }
    return out;
  } catch {
    return {};
  }
}

