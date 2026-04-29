import pool from '../../db/pool';
import { ActiveSubscription } from './types';

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  plan_code: string;
  plan_name_fr: string;
  status: ActiveSubscription['status'];
  timezone: string;
  current_period_start_at: string;
  current_period_end_at: string;
  cancel_at_period_end: boolean;
}

function toActiveSubscription(row: SubscriptionRow): ActiveSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    planCode: row.plan_code,
    planNameFr: row.plan_name_fr,
    status: row.status,
    timezone: row.timezone,
    currentPeriodStartAt: row.current_period_start_at,
    currentPeriodEndAt: row.current_period_end_at,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

export async function getActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
  const { rows } = await pool.query<SubscriptionRow>(
    `SELECT us.id, us.user_id, us.plan_id, sp.code AS plan_code, sp.display_name_fr AS plan_name_fr,
            us.status, us.timezone, us.current_period_start_at, us.current_period_end_at, us.cancel_at_period_end
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1
       AND us.status IN ('active', 'grace')
       AND us.current_period_end_at > NOW()
     ORDER BY us.current_period_end_at DESC
     LIMIT 1`,
    [userId],
  );
  return rows.length ? toActiveSubscription(rows[0]) : null;
}

export async function getLatestSubscription(userId: string): Promise<ActiveSubscription | null> {
  const { rows } = await pool.query<SubscriptionRow>(
    `SELECT us.id, us.user_id, us.plan_id, sp.code AS plan_code, sp.display_name_fr AS plan_name_fr,
            us.status, us.timezone, us.current_period_start_at, us.current_period_end_at, us.cancel_at_period_end
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1
     ORDER BY us.current_period_end_at DESC
     LIMIT 1`,
    [userId],
  );
  return rows.length ? toActiveSubscription(rows[0]) : null;
}

