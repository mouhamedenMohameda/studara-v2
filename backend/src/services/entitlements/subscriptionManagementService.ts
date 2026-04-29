import pool from '../../db/pool';
import { getActiveSubscription, getLatestSubscription } from './activeSubscriptionService';
import {
  getActiveBoosters,
  getBoosterByCode,
  getPlanByCode,
  getPlanEntitlements,
} from './catalogService';
import { ensureUsageBucketsForUser } from './usageCounterService';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

/** Durée d’une période d’abonnement en jours (synchro `user_subscriptions` ↔ buckets usage). */
export async function resolvePlanPeriodDays(planId: string, override?: number): Promise<number> {
  if (override != null && Number.isFinite(override) && override > 0) {
    return Math.max(1, Math.floor(override));
  }
  const { rows } = await pool.query<{ billing_period_unit: string; billing_period_count: string | number }>(
    `SELECT billing_period_unit, billing_period_count FROM subscription_plans WHERE id = $1`,
    [planId],
  );
  const unit = rows[0]?.billing_period_unit ?? 'month';
  const count = Math.max(1, Math.floor(toNumber(rows[0]?.billing_period_count ?? 1)));
  if (unit === 'day') return count;
  if (unit === 'month') return 30 * count;
  return 30 * count;
}

export async function getMySubscriptionSnapshot(userId: string, userRole?: string): Promise<{
  status: string;
  planCode: string | null;
  planNameFr: string | null;
  currentPeriodStartAt: string | null;
  currentPeriodEndAt: string | null;
  timezone: string | null;
  cancelAtPeriodEnd: boolean;
  boosters: Array<{ code: string; displayNameFr: string; activatedAt: string; expiresAt: string }>;
  isStaffBypass: boolean;
}> {
  if (userRole === 'admin' || userRole === 'moderator') {
    return {
      status: 'active',
      planCode: 'staff_bypass',
      planNameFr: 'Staff bypass',
      currentPeriodStartAt: null,
      currentPeriodEndAt: null,
      timezone: 'Africa/Nouakchott',
      cancelAtPeriodEnd: false,
      boosters: [],
      isStaffBypass: true,
    };
  }

  const [active, latest, boosters] = await Promise.all([
    getActiveSubscription(userId),
    getLatestSubscription(userId),
    getActiveBoosters(userId),
  ]);

  const source = active ?? latest;
  return {
    status: source?.status ?? 'none',
    planCode: source?.planCode ?? null,
    planNameFr: source?.planNameFr ?? null,
    currentPeriodStartAt: source?.currentPeriodStartAt ?? null,
    currentPeriodEndAt: source?.currentPeriodEndAt ?? null,
    timezone: source?.timezone ?? null,
    cancelAtPeriodEnd: source?.cancelAtPeriodEnd ?? false,
    boosters: boosters.map((b) => ({
      code: b.code,
      displayNameFr: b.displayNameFr,
      activatedAt: b.activatedAt,
      expiresAt: b.expiresAt,
    })),
    isStaffBypass: false,
  };
}

export async function simulateUpgrade(userId: string, targetPlanCode: string): Promise<{
  currentPlanCode: string | null;
  targetPlanCode: string;
  currentEntitlements: Record<string, unknown>;
  targetEntitlements: Record<string, unknown>;
  deltas: Array<{ key: string; from: unknown; to: unknown }>;
}> {
  const target = await getPlanByCode(targetPlanCode);
  if (!target) {
    throw Object.assign(new Error('Target plan not found'), { status: 404 });
  }

  const active = await getActiveSubscription(userId);
  const currentEntitlements = active ? await getPlanEntitlements(active.planId) : {};
  const targetEntitlements = await getPlanEntitlements(target.id);

  const allKeys = new Set<string>([
    ...Object.keys(currentEntitlements),
    ...Object.keys(targetEntitlements),
  ]);

  const deltas: Array<{ key: string; from: unknown; to: unknown }> = [];
  for (const key of allKeys) {
    const from = currentEntitlements[key] ?? null;
    const to = targetEntitlements[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      deltas.push({ key, from, to });
    }
  }

  return {
    currentPlanCode: active?.planCode ?? null,
    targetPlanCode,
    currentEntitlements,
    targetEntitlements,
    deltas,
  };
}

export async function activateBoosterForUser(params: {
  userId: string;
  boosterCode: string;
  source?: 'payment' | 'admin' | 'promo' | 'migration';
  providerRef?: string | null;
}): Promise<{
  purchaseId: string;
  boosterCode: string;
  activatedAt: string;
  expiresAt: string;
}> {
  const booster = await getBoosterByCode(params.boosterCode);
  if (!booster || !booster.isActive) {
    throw Object.assign(new Error('Booster not found or inactive'), { status: 404 });
  }

  const { rows } = await pool.query<{ id: string; activated_at: string; expires_at: string }>(
    `INSERT INTO booster_purchases (user_id, booster_id, status, provider_ref, activated_at, expires_at, source, metadata)
     VALUES ($1, $2, 'active', $3, NOW(), NOW() + ($4 || ' days')::interval, $5, '{}'::jsonb)
     RETURNING id, activated_at, expires_at`,
    [params.userId, booster.id, params.providerRef ?? null, booster.durationDays, params.source ?? 'payment'],
  );
  const created = rows[0];

  await ensureUsageBucketsForUser(params.userId);

  return {
    purchaseId: created.id,
    boosterCode: booster.code,
    activatedAt: created.activated_at,
    expiresAt: created.expires_at,
  };
}

export async function activateSubscriptionForUser(params: {
  userId: string;
  planCode: string;
  source?: 'payment' | 'admin' | 'migration' | 'promo';
  providerRef?: string | null;
  periodDays?: number;
  timezone?: string;
}): Promise<{
  subscriptionId: string;
  planCode: string;
  currentPeriodStartAt: string;
  currentPeriodEndAt: string;
}> {
  const plan = await getPlanByCode(params.planCode);
  if (!plan || !plan.isActive) {
    throw Object.assign(new Error('Plan not found or inactive'), { status: 404 });
  }

  const periodDays = await resolvePlanPeriodDays(plan.id, params.periodDays);
  const timezone = params.timezone ?? 'Africa/Nouakchott';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE user_subscriptions
       SET status = 'expired',
           updated_at = NOW()
       WHERE user_id = $1
         AND status IN ('active', 'grace')`,
      [params.userId],
    );

    const { rows } = await client.query<{ id: string; current_period_start_at: string; current_period_end_at: string }>(
      `INSERT INTO user_subscriptions
        (user_id, plan_id, status, provider_ref, source, timezone, current_period_start_at, current_period_end_at, metadata)
       VALUES
        ($1, $2, 'active', $3, $4, $5, NOW(), NOW() + ($6 || ' days')::interval, '{}'::jsonb)
       RETURNING id, current_period_start_at, current_period_end_at`,
      [params.userId, plan.id, params.providerRef ?? null, params.source ?? 'payment', timezone, periodDays],
    );

    await client.query('COMMIT');
    const created = rows[0];
    await ensureUsageBucketsForUser(params.userId);

    return {
      subscriptionId: created.id,
      planCode: plan.code,
      currentPeriodStartAt: created.current_period_start_at,
      currentPeriodEndAt: created.current_period_end_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPlanPriceCard(): Promise<Array<{
  code: string;
  displayNameFr: string;
  descriptionFr: string;
  monthlyPriceMru: number;
  sortOrder: number;
}>> {
  const { rows } = await pool.query<{
    code: string;
    display_name_fr: string;
    description_fr: string;
    monthly_price_mru: string | number;
    sort_order: string | number;
  }>(
    `SELECT code, display_name_fr, description_fr, monthly_price_mru, sort_order
     FROM subscription_plans
     WHERE is_active = TRUE
     ORDER BY sort_order ASC`,
  );

  return rows.map((row) => ({
    code: row.code,
    displayNameFr: row.display_name_fr,
    descriptionFr: row.description_fr,
    monthlyPriceMru: toNumber(row.monthly_price_mru),
    sortOrder: toNumber(row.sort_order),
  }));
}

