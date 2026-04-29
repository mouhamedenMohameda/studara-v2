import { PoolClient } from 'pg';
import pool from '../../db/pool';
import { getActiveSubscription } from './activeSubscriptionService';
import { getActiveBoosters, getBoosterEntitlements, getPlanEntitlements } from './catalogService';
import { ConsumeRequest, CounterKey, CounterUsageSummary, UsageBucket } from './types';

const COUNTER_KEYS: CounterKey[] = ['ai_messages', 'ocr_pages', 'pdf_analyses', 'premium_answers'];

const ENTITLEMENT_TO_COUNTER: Record<string, { counterKey: CounterKey; windowType: 'daily' | 'billing_cycle' }> = {
  daily_ai_messages_limit: { counterKey: 'ai_messages', windowType: 'daily' },
  monthly_ocr_pages_limit: { counterKey: 'ocr_pages', windowType: 'billing_cycle' },
  monthly_pdf_analysis_limit: { counterKey: 'pdf_analyses', windowType: 'billing_cycle' },
  premium_answers_monthly_limit: { counterKey: 'premium_answers', windowType: 'billing_cycle' },
};

interface DailyWindowRow {
  window_start: string;
  window_end: string;
}

interface AggregateRow {
  counter_key: CounterKey;
  limit_total: string | number;
  used_total: string | number;
  reserved_total: string | number;
}

interface BucketRow {
  id: string;
  user_id: string;
  counter_key: CounterKey;
  source_type: 'subscription' | 'booster' | 'admin_credit';
  source_id: string;
  window_type: 'daily' | 'billing_cycle' | 'rolling_30d' | 'fixed_window';
  window_start_at: string;
  window_end_at: string;
  limit_total: string | number;
  used_total: string | number;
  reserved_total: string | number;
  expires_at: string;
}

interface UsageEventRow {
  id: string;
  idempotency_key: string;
  status: 'pending' | 'committed' | 'released' | 'rejected';
  feature_key: string;
  allocation_json: Array<{ bucketId: string; counterKey: CounterKey; amount: number }> | unknown;
  amount_requested: string | number;
  amount_committed: string | number;
  metadata: Record<string, unknown> | null;
}

function toNumber(value: string | number): number {
  return Number(value);
}

function ensureCounterKey(value: string): CounterKey {
  if (COUNTER_KEYS.includes(value as CounterKey)) return value as CounterKey;
  throw Object.assign(new Error(`Unknown counter_key: ${value}`), { status: 400 });
}

async function getDailyWindow(timezone: string): Promise<{ startAt: string; endAt: string }> {
  const { rows } = await pool.query<DailyWindowRow>(
    `SELECT
       (date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1) AS window_start,
       ((date_trunc('day', NOW() AT TIME ZONE $1) + INTERVAL '1 day') AT TIME ZONE $1) AS window_end`,
    [timezone],
  );
  return {
    startAt: rows[0].window_start,
    endAt: rows[0].window_end,
  };
}

function maxIso(a: string, b: string): string {
  return new Date(a) > new Date(b) ? a : b;
}

function minIso(a: string, b: string): string {
  return new Date(a) < new Date(b) ? a : b;
}

async function upsertUsageBucket(
  client: PoolClient,
  params: {
    userId: string;
    counterKey: CounterKey;
    sourceType: 'subscription' | 'booster' | 'admin_credit';
    sourceId: string;
    windowType: 'daily' | 'billing_cycle' | 'rolling_30d' | 'fixed_window';
    windowStartAt: string;
    windowEndAt: string;
    limitTotal: number;
    expiresAt: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO user_usage_counters
      (user_id, counter_key, source_type, source_id, window_type, window_start_at, window_end_at, limit_total, expires_at, metadata)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (user_id, counter_key, source_type, source_id, window_start_at, window_end_at)
     DO UPDATE
       SET limit_total = EXCLUDED.limit_total,
           expires_at = EXCLUDED.expires_at,
           metadata = user_usage_counters.metadata || EXCLUDED.metadata`,
    [
      params.userId,
      params.counterKey,
      params.sourceType,
      params.sourceId,
      params.windowType,
      params.windowStartAt,
      params.windowEndAt,
      params.limitTotal,
      params.expiresAt,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
}

async function ensureSubscriptionBuckets(client: PoolClient, userId: string): Promise<void> {
  const subscription = await getActiveSubscription(userId);
  if (!subscription) return;

  const planEntitlements = await getPlanEntitlements(subscription.planId);
  const dailyWindow = await getDailyWindow(subscription.timezone || 'Africa/Nouakchott');

  for (const [entitlementKey, mapping] of Object.entries(ENTITLEMENT_TO_COUNTER)) {
    const rawValue = planEntitlements[entitlementKey];
    const limitValue = Number(rawValue ?? 0);
    if (!Number.isFinite(limitValue) || limitValue <= 0) continue;

    if (mapping.windowType === 'daily') {
      const startAt = maxIso(dailyWindow.startAt, subscription.currentPeriodStartAt);
      const endAt = minIso(dailyWindow.endAt, subscription.currentPeriodEndAt);
      if (new Date(endAt) <= new Date(startAt)) continue;

      await upsertUsageBucket(client, {
        userId,
        counterKey: mapping.counterKey,
        sourceType: 'subscription',
        sourceId: subscription.id,
        windowType: 'daily',
        windowStartAt: startAt,
        windowEndAt: endAt,
        limitTotal: limitValue,
        expiresAt: subscription.currentPeriodEndAt,
        metadata: { planCode: subscription.planCode, entitlementKey },
      });
      continue;
    }

    await upsertUsageBucket(client, {
      userId,
      counterKey: mapping.counterKey,
      sourceType: 'subscription',
      sourceId: subscription.id,
      windowType: 'billing_cycle',
      windowStartAt: subscription.currentPeriodStartAt,
      windowEndAt: subscription.currentPeriodEndAt,
      limitTotal: limitValue,
      expiresAt: subscription.currentPeriodEndAt,
      metadata: { planCode: subscription.planCode, entitlementKey },
    });
  }
}

async function ensureBoosterBuckets(client: PoolClient, userId: string): Promise<void> {
  const subscription = await getActiveSubscription(userId);
  const timezone = subscription?.timezone ?? 'Africa/Nouakchott';
  const dailyWindow = await getDailyWindow(timezone);
  const boosters = await getActiveBoosters(userId);

  for (const booster of boosters) {
    const values = await getBoosterEntitlements(booster.boosterId);
    for (const [entitlementKey, rawValue] of Object.entries(values)) {
      const mapping = ENTITLEMENT_TO_COUNTER[entitlementKey];
      if (!mapping) continue;

      const limitValue = Number(rawValue ?? 0);
      if (!Number.isFinite(limitValue) || limitValue <= 0) continue;

      if (mapping.windowType === 'daily') {
        const startAt = maxIso(dailyWindow.startAt, booster.activatedAt);
        const endAt = minIso(dailyWindow.endAt, booster.expiresAt);
        if (new Date(endAt) <= new Date(startAt)) continue;

        await upsertUsageBucket(client, {
          userId,
          counterKey: mapping.counterKey,
          sourceType: 'booster',
          sourceId: booster.id,
          windowType: 'daily',
          windowStartAt: startAt,
          windowEndAt: endAt,
          limitTotal: limitValue,
          expiresAt: booster.expiresAt,
          metadata: { boosterCode: booster.code, entitlementKey },
        });
        continue;
      }

      await upsertUsageBucket(client, {
        userId,
        counterKey: mapping.counterKey,
        sourceType: 'booster',
        sourceId: booster.id,
        windowType: 'fixed_window',
        windowStartAt: booster.activatedAt,
        windowEndAt: booster.expiresAt,
        limitTotal: limitValue,
        expiresAt: booster.expiresAt,
        metadata: { boosterCode: booster.code, entitlementKey },
      });
    }
  }
}

export async function ensureUsageBucketsForUser(userId: string, userRole?: string): Promise<void> {
  if (userRole === 'admin' || userRole === 'moderator') return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureSubscriptionBuckets(client, userId);
    await ensureBoosterBuckets(client, userId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function emptyRemaining(): Record<CounterKey, number> {
  return {
    ai_messages: 0,
    ocr_pages: 0,
    pdf_analyses: 0,
    premium_answers: 0,
  };
}

export async function getRemainingByCounter(userId: string, userRole?: string): Promise<Record<CounterKey, number>> {
  if (userRole === 'admin' || userRole === 'moderator') {
    return {
      ai_messages: 999999,
      ocr_pages: 999999,
      pdf_analyses: 999999,
      premium_answers: 999999,
    };
  }

  const remaining = emptyRemaining();
  const { rows } = await pool.query<AggregateRow>(
    `SELECT
       counter_key,
       SUM(limit_total) AS limit_total,
       SUM(used_total) AS used_total,
       SUM(reserved_total) AS reserved_total
     FROM user_usage_counters
     WHERE user_id = $1
       AND window_start_at <= NOW()
       AND window_end_at > NOW()
       AND expires_at > NOW()
     GROUP BY counter_key`,
    [userId],
  );
  for (const row of rows) {
    const key = ensureCounterKey(row.counter_key);
    const total = toNumber(row.limit_total) - toNumber(row.used_total) - toNumber(row.reserved_total);
    remaining[key] = Math.max(0, total);
  }
  return remaining;
}

export async function getUsageSnapshot(
  userId: string,
  userRole?: string,
): Promise<{ counters: CounterUsageSummary[]; buckets: UsageBucket[] }> {
  if (userRole === 'admin' || userRole === 'moderator') {
    return {
      counters: COUNTER_KEYS.map((k) => ({
        counterKey: k,
        limitTotal: 999999,
        usedTotal: 0,
        reservedTotal: 0,
        remainingTotal: 999999,
      })),
      buckets: [],
    };
  }

  await ensureUsageBucketsForUser(userId, userRole);

  const [aggregateRes, bucketRes] = await Promise.all([
    pool.query<AggregateRow>(
      `SELECT
         counter_key,
         SUM(limit_total) AS limit_total,
         SUM(used_total) AS used_total,
         SUM(reserved_total) AS reserved_total
       FROM user_usage_counters
       WHERE user_id = $1
         AND window_start_at <= NOW()
         AND window_end_at > NOW()
         AND expires_at > NOW()
       GROUP BY counter_key`,
      [userId],
    ),
    pool.query<BucketRow>(
      `SELECT id, user_id, counter_key, source_type, source_id, window_type, window_start_at, window_end_at,
              limit_total, used_total, reserved_total, expires_at
       FROM user_usage_counters
       WHERE user_id = $1
         AND window_start_at <= NOW()
         AND window_end_at > NOW()
         AND expires_at > NOW()
       ORDER BY counter_key ASC, window_end_at ASC`,
      [userId],
    ),
  ]);

  const byKey = new Map<CounterKey, CounterUsageSummary>();
  for (const key of COUNTER_KEYS) {
    byKey.set(key, { counterKey: key, limitTotal: 0, usedTotal: 0, reservedTotal: 0, remainingTotal: 0 });
  }

  for (const row of aggregateRes.rows) {
    const key = ensureCounterKey(row.counter_key);
    const limitTotal = toNumber(row.limit_total);
    const usedTotal = toNumber(row.used_total);
    const reservedTotal = toNumber(row.reserved_total);
    byKey.set(key, {
      counterKey: key,
      limitTotal,
      usedTotal,
      reservedTotal,
      remainingTotal: Math.max(0, limitTotal - usedTotal - reservedTotal),
    });
  }

  const buckets: UsageBucket[] = bucketRes.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    counterKey: ensureCounterKey(row.counter_key),
    sourceType: row.source_type,
    sourceId: row.source_id,
    windowType: row.window_type,
    windowStartAt: row.window_start_at,
    windowEndAt: row.window_end_at,
    limitTotal: toNumber(row.limit_total),
    usedTotal: toNumber(row.used_total),
    reservedTotal: toNumber(row.reserved_total),
    expiresAt: row.expires_at,
  }));

  return {
    counters: COUNTER_KEYS.map((k) => byKey.get(k)!),
    buckets,
  };
}

function normalizeAllocations(value: UsageEventRow['allocation_json']): Array<{ bucketId: string; counterKey: CounterKey; amount: number }> {
  if (!Array.isArray(value)) return [];
  const list: Array<{ bucketId: string; counterKey: CounterKey; amount: number }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const bucketId = (item as { bucketId?: unknown }).bucketId;
    const counterKey = (item as { counterKey?: unknown }).counterKey;
    const amount = (item as { amount?: unknown }).amount;
    if (typeof bucketId !== 'string' || typeof counterKey !== 'string') continue;
    if (!COUNTER_KEYS.includes(counterKey as CounterKey)) continue;
    const parsedAmount = Number(amount ?? 0);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) continue;
    list.push({ bucketId, counterKey: counterKey as CounterKey, amount: parsedAmount });
  }
  return list;
}

export async function consumeQuota(
  userId: string,
  req: ConsumeRequest,
  userRole?: string,
): Promise<{
  idempotencyKey: string;
  status: 'committed' | 'released' | 'pending' | 'rejected';
  amountRequested: number;
  amountCommitted: number;
  allocations: Array<{ bucketId: string; counterKey: CounterKey; amount: number }>;
}> {
  if (userRole === 'admin' || userRole === 'moderator') {
    return {
      idempotencyKey: req.idempotencyKey,
      status: 'committed',
      amountRequested: req.items.reduce((s, i) => s + i.amount, 0),
      amountCommitted: req.items.reduce((s, i) => s + i.amount, 0),
      allocations: req.items.map((i) => ({ bucketId: 'staff', counterKey: i.counterKey, amount: i.amount })),
    };
  }

  if (!req.idempotencyKey || req.idempotencyKey.length < 8) {
    throw Object.assign(new Error('idempotencyKey is required and must be >= 8 chars'), { status: 400 });
  }
  if (!Array.isArray(req.items) || req.items.length === 0) {
    throw Object.assign(new Error('items must be a non-empty array'), { status: 400 });
  }
  for (const item of req.items) {
    ensureCounterKey(item.counterKey);
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      throw Object.assign(new Error('item.amount must be > 0'), { status: 400 });
    }
  }

  await ensureUsageBucketsForUser(userId, userRole);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO usage_events (idempotency_key, user_id, feature_key, event_type, amount_requested, status, metadata)
       VALUES ($1, $2, $3, 'commit', $4, 'pending', $5::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        req.idempotencyKey,
        userId,
        req.featureKey,
        req.items.reduce((sum, item) => sum + item.amount, 0),
        JSON.stringify(req.metadata ?? {}),
      ],
    );

    if (!inserted.rows.length) {
      const { rows } = await client.query<UsageEventRow>(
        `SELECT id, idempotency_key, status, feature_key, allocation_json, amount_requested, amount_committed, metadata
         FROM usage_events
         WHERE idempotency_key = $1
           AND user_id = $2
         LIMIT 1`,
        [req.idempotencyKey, userId],
      );
      await client.query('COMMIT');
      const existing = rows[0];
      if (!existing) {
        throw Object.assign(new Error('Failed to resolve existing idempotent usage event'), { status: 409 });
      }
      return {
        idempotencyKey: existing.idempotency_key,
        status: existing.status,
        amountRequested: toNumber(existing.amount_requested),
        amountCommitted: toNumber(existing.amount_committed),
        allocations: normalizeAllocations(existing.allocation_json),
      };
    }

    const allocations: Array<{ bucketId: string; counterKey: CounterKey; amount: number }> = [];
    for (const item of req.items) {
      let remaining = item.amount;
      const bucketResult = await client.query<BucketRow>(
        `SELECT id, user_id, counter_key, source_type, source_id, window_type, window_start_at, window_end_at,
                limit_total, used_total, reserved_total, expires_at
         FROM user_usage_counters
         WHERE user_id = $1
           AND counter_key = $2
           AND window_start_at <= NOW()
           AND window_end_at > NOW()
           AND expires_at > NOW()
           AND (limit_total - used_total - reserved_total) > 0
         ORDER BY window_end_at ASC
         FOR UPDATE`,
        [userId, item.counterKey],
      );

      for (const bucket of bucketResult.rows) {
        if (remaining <= 0) break;
        const available = Math.max(0, toNumber(bucket.limit_total) - toNumber(bucket.used_total) - toNumber(bucket.reserved_total));
        if (available <= 0) continue;
        const consume = Math.min(available, remaining);

        await client.query(
          `UPDATE user_usage_counters
           SET used_total = used_total + $1, updated_at = NOW()
           WHERE id = $2`,
          [consume, bucket.id],
        );
        allocations.push({ bucketId: bucket.id, counterKey: item.counterKey, amount: consume });
        remaining -= consume;
      }

      if (remaining > 0) {
        throw Object.assign(new Error(`Insufficient quota for ${item.counterKey}`), {
          status: 409,
          code: 'insufficient_quota',
          counterKey: item.counterKey,
        });
      }
    }

    const committed = allocations.reduce((sum, a) => sum + a.amount, 0);
    await client.query(
      `UPDATE usage_events
       SET status = 'committed',
           amount_committed = $2,
           allocation_json = $3::jsonb,
           metadata = metadata || $4::jsonb
       WHERE idempotency_key = $1`,
      [
        req.idempotencyKey,
        committed,
        JSON.stringify(allocations),
        JSON.stringify(req.metadata ?? {}),
      ],
    );

    await client.query('COMMIT');
    return {
      idempotencyKey: req.idempotencyKey,
      status: 'committed',
      amountRequested: req.items.reduce((sum, i) => sum + i.amount, 0),
      amountCommitted: committed,
      allocations,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function releaseUsageByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
  reason?: string,
): Promise<{
  idempotencyKey: string;
  status: 'committed' | 'released' | 'pending' | 'rejected';
  allocations: Array<{ bucketId: string; counterKey: CounterKey; amount: number }>;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<UsageEventRow>(
      `SELECT id, idempotency_key, status, feature_key, allocation_json, amount_requested, amount_committed, metadata
       FROM usage_events
       WHERE idempotency_key = $1
         AND user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [idempotencyKey, userId],
    );
    if (!rows.length) {
      throw Object.assign(new Error('Usage event not found'), { status: 404 });
    }

    const event = rows[0];
    const allocations = normalizeAllocations(event.allocation_json);
    if (event.status === 'released') {
      await client.query('COMMIT');
      return { idempotencyKey, status: 'released', allocations };
    }
    if (event.status !== 'committed') {
      await client.query('COMMIT');
      return { idempotencyKey, status: event.status, allocations };
    }

    for (const allocation of allocations) {
      await client.query(
        `UPDATE user_usage_counters
         SET used_total = GREATEST(0, used_total - $1),
             updated_at = NOW()
         WHERE id = $2`,
        [allocation.amount, allocation.bucketId],
      );
    }

    await client.query(
      `UPDATE usage_events
       SET status = 'released',
           event_type = 'release',
           metadata = metadata || $2::jsonb
       WHERE idempotency_key = $1`,
      [idempotencyKey, JSON.stringify({ releaseReason: reason ?? null, releasedAt: new Date().toISOString() })],
    );

    await client.query('COMMIT');
    return { idempotencyKey, status: 'released', allocations };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createAdminQuotaCredit(params: {
  userId: string;
  counterKey: CounterKey;
  amount: number;
  expiresAt: string;
  note?: string;
  createdBy?: string;
}): Promise<{ creditId: string; counterKey: CounterKey; amount: number; expiresAt: string }> {
  if (!COUNTER_KEYS.includes(params.counterKey)) {
    throw Object.assign(new Error('Invalid counterKey'), { status: 400 });
  }
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw Object.assign(new Error('amount must be > 0'), { status: 400 });
  }
  const expiresAt = new Date(params.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw Object.assign(new Error('expiresAt must be a valid future ISO date'), { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string; starts_at: string; expires_at: string }>(
      `INSERT INTO admin_quota_credits (user_id, counter_key, amount, starts_at, expires_at, note, created_by)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6)
       RETURNING id, starts_at, expires_at`,
      [params.userId, params.counterKey, params.amount, params.expiresAt, params.note ?? '', params.createdBy ?? null],
    );
    const credit = inserted.rows[0];

    await upsertUsageBucket(client, {
      userId: params.userId,
      counterKey: params.counterKey,
      sourceType: 'admin_credit',
      sourceId: credit.id,
      windowType: 'fixed_window',
      windowStartAt: credit.starts_at,
      windowEndAt: credit.expires_at,
      limitTotal: params.amount,
      expiresAt: credit.expires_at,
      metadata: { note: params.note ?? '', createdBy: params.createdBy ?? null },
    });

    await client.query('COMMIT');
    return {
      creditId: credit.id,
      counterKey: params.counterKey,
      amount: params.amount,
      expiresAt: credit.expires_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

