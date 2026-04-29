/**
 * Subscription / Billing service
 *
 * Logic:
 *  effective_until = MAX(trial_ends_at, COALESCE(paid_until, trial_ends_at))
 *                    + bonus_days days
 *
 *  status:
 *    'trial'    → paid_until IS NULL  AND effective_until > NOW()
 *    'active'   → paid_until IS NOT NULL AND effective_until > NOW()
 *    'expired'  → effective_until <= NOW()
 *    'cancelled'→ stored in the row
 */

import pool from '../db/pool';
import { getActiveSubscription } from './entitlements/activeSubscriptionService';
import { authorizeFeature } from './entitlements/authorizationService';
import type { FeatureKey } from './entitlements/types';

export interface SubscriptionInfo {
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  hasAccess: boolean;
  trialEndsAt: string;
  paidUntil: string | null;
  effectiveUntil: string;
  daysLeft: number;
  acceptedUploadsCount: number;
  bonusDays: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Recomputes effective_until and status, persists, returns fresh info */
async function refresh(userId: string): Promise<SubscriptionInfo> {
  // Upsert a row if somehow missing (shouldn't happen after migration)
  await pool.query(
    `INSERT INTO subscriptions (user_id, trial_ends_at, effective_until)
     SELECT id, created_at + INTERVAL '7 days', created_at + INTERVAL '7 days'
     FROM users WHERE id = $1
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  const { rows } = await pool.query(
    `SELECT trial_ends_at, paid_until, bonus_days, accepted_uploads_count
     FROM subscriptions WHERE user_id = $1`,
    [userId],
  );
  if (!rows.length) throw Object.assign(new Error('Subscription not found'), { status: 404 });
  const row = rows[0];

  const trialEnd  = new Date(row.trial_ends_at);
  const paidUntil = row.paid_until ? new Date(row.paid_until) : null;
  const bonus     = row.bonus_days as number;

  const base           = paidUntil && paidUntil > trialEnd ? paidUntil : trialEnd;
  const effectiveUntil = new Date(base.getTime() + bonus * 86_400_000);
  const now            = new Date();
  const hasAccess      = effectiveUntil > now;
  const daysLeft       = Math.max(0, Math.ceil((effectiveUntil.getTime() - now.getTime()) / 86_400_000));

  let status: SubscriptionInfo['status'];
  if (!hasAccess) {
    status = 'expired';
  } else if (paidUntil) {
    status = 'active';
  } else {
    status = 'trial';
  }

  // Persist the recomputed effective_until
  await pool.query(
    `UPDATE subscriptions SET effective_until = $1 WHERE user_id = $2`,
    [effectiveUntil.toISOString(), userId],
  );

  return {
    status,
    hasAccess,
    trialEndsAt:          trialEnd.toISOString(),
    paidUntil:            paidUntil?.toISOString() ?? null,
    effectiveUntil:       effectiveUntil.toISOString(),
    daysLeft,
    acceptedUploadsCount: row.accepted_uploads_count,
    bonusDays:            bonus,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns full subscription status for a user */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionInfo> {
  return refresh(userId);
}

/**
 * Called when an admin APPROVES a resource.
 * Increments accepted_uploads_count AND bonus_days by 1.
 * Returns the new bonus_days total.
 */
export async function awardBonusDay(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE subscriptions
     SET accepted_uploads_count = accepted_uploads_count + 1,
         bonus_days             = bonus_days + 1
     WHERE user_id = $1
     RETURNING bonus_days`,
    [userId],
  );
  if (!rows.length) return 0;
  // Recompute effective_until after bonus update
  await refresh(userId);
  console.log(`[billing] User ${userId} awarded +1 bonus day (total: ${rows[0].bonus_days})`);
  return rows[0].bonus_days;
}

/**
 * Admin manually grants a paid subscription for N days.
 * paid_until is extended from today (or existing paid_until) + days.
 */
export async function activateSubscription(userId: string, days: number): Promise<SubscriptionInfo> {
  await pool.query(
    `UPDATE subscriptions
     SET paid_until = GREATEST(COALESCE(paid_until, NOW()), NOW()) + ($1 * INTERVAL '1 day')
     WHERE user_id = $2`,
    [days, userId],
  );
  return refresh(userId);
}

/**
 * Quick boolean — used in middleware.
 * Does NOT refresh/persist (fast path).
 */
export async function checkHasAccess(userId: string): Promise<boolean> {
  await pool.query(
    `INSERT INTO subscriptions (user_id, trial_ends_at, effective_until)
     SELECT id, created_at + INTERVAL '7 days', created_at + INTERVAL '7 days'
     FROM users WHERE id = $1
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const { rows } = await pool.query(
    `SELECT trial_ends_at, paid_until, bonus_days FROM subscriptions WHERE user_id = $1`,
    [userId],
  );
  if (!rows.length) return false;
  const row        = rows[0];
  const trialEnd   = new Date(row.trial_ends_at);
  const paidUntil  = row.paid_until ? new Date(row.paid_until) : null;
  const bonus      = (row.bonus_days as number) ?? 0;
  const base       = paidUntil && paidUntil > trialEnd ? paidUntil : trialEnd;
  const effective  = new Date(base.getTime() + bonus * 86_400_000);
  return effective > new Date();
}

// ─── Per-Feature PAYG Wallet ──────────────────────────────────────────────────

export interface PremiumFeatureInfo {
  hasAccess:          boolean;
  balanceMru:         number;
  totalToppedUpMru:   number;
  totalSpentMru:      number;
  /** @deprecated use balanceMru instead */
  expiresAt:          string | null;
  /** @deprecated use balanceMru instead */
  daysLeft:           number;
  /** Accès via abonnement catalogue (sans portefeuille MRU pour cette feature). */
  includedInCatalogPlan?: boolean;
}

const UNIVERSAL_WALLET_KEY = 'wallet_universal';

/** Clés PAYG connues de l’app → contrôle entitlements équivalent (GET billing/features/.../access). */
const CATALOG_BILLING_ACCESS: Record<
  string,
  { featureKey: FeatureKey; context?: { pages?: number; deepModeRequested?: boolean } }
> = {
  ai_flashcards:  { featureKey: 'ocr_scan', context: { pages: 1 } },
  whisper_studio: { featureKey: 'chat_standard' },
};

/**
 * Returns the wallet state for a user+feature.
 * hasAccess = true when balance > 0 (or admin/moderator).
 */
export async function hasPremiumFeature(
  userId: string,
  featureKey: string,
  userRole?: string,
): Promise<PremiumFeatureInfo> {
  if (userRole === 'admin' || userRole === 'moderator') {
    return {
      hasAccess: true,
      balanceMru: 999999,
      totalToppedUpMru: 0,
      totalSpentMru: 0,
      expiresAt: null,
      daysLeft: 999,
      includedInCatalogPlan: false,
    };
  }

  const info = await getWallet(userId, featureKey);
  const universal = featureKey === UNIVERSAL_WALLET_KEY ? info : await getWallet(userId, UNIVERSAL_WALLET_KEY);

  if (info.balanceMru > 0) {
    return {
      hasAccess: true,
      balanceMru: info.balanceMru,
      totalToppedUpMru: info.totalToppedUpMru,
      totalSpentMru: info.totalSpentMru,
      expiresAt: null,
      daysLeft: 0,
      includedInCatalogPlan: false,
    };
  }

  if (universal.balanceMru > 0) {
    return {
      hasAccess: true,
      balanceMru: universal.balanceMru,
      totalToppedUpMru: universal.totalToppedUpMru,
      totalSpentMru: universal.totalSpentMru,
      expiresAt: null,
      daysLeft: 0,
      includedInCatalogPlan: false,
    };
  }

  const map = CATALOG_BILLING_ACCESS[featureKey];
  const sub = await getActiveSubscription(userId);
  if (map && sub) {
    try {
      const d = await authorizeFeature({
        userId,
        userRole,
        featureKey: map.featureKey,
        context: map.context,
      });
      if (d.decision === 'allowed') {
        return {
          hasAccess: true,
          balanceMru: info.balanceMru,
          totalToppedUpMru: info.totalToppedUpMru,
          totalSpentMru: info.totalSpentMru,
          expiresAt: null,
          daysLeft: 0,
          includedInCatalogPlan: true,
        };
      }
    } catch {
      // ignore — fallback sans accès catalogue
    }
  }

  return {
    hasAccess: false,
    balanceMru: info.balanceMru,
    totalToppedUpMru: info.totalToppedUpMru,
    totalSpentMru: info.totalSpentMru,
    expiresAt: null,
    daysLeft: 0,
    includedInCatalogPlan: false,
  };
}

/**
 * Returns the wallet balance for a specific user+feature.
 */
export async function getWallet(
  userId: string,
  featureKey: string,
): Promise<{ balanceMru: number; totalToppedUpMru: number; totalSpentMru: number }> {
  const { rows } = await pool.query(
    `SELECT balance_mru, total_topped_up_mru, total_spent_mru
     FROM user_feature_wallets
     WHERE user_id = $1 AND feature_key = $2`,
    [userId, featureKey],
  );
  if (!rows.length) return { balanceMru: 0, totalToppedUpMru: 0, totalSpentMru: 0 };
  return {
    balanceMru:       rows[0].balance_mru,
    totalToppedUpMru: rows[0].total_topped_up_mru,
    totalSpentMru:    rows[0].total_spent_mru,
  };
}

/**
 * Credit a user's wallet for a specific feature.
 * Called when admin approves a top-up request.
 */
export async function topUpWallet(
  userId: string,
  featureKey: string,
  amountMru: number,
  requestId?: string,
): Promise<PremiumFeatureInfo> {
  const { rows: featRows } = await pool.query(
    `SELECT 1 FROM premium_features WHERE key = $1 AND is_active = true`,
    [featureKey],
  );
  if (!featRows.length) {
    throw new Error(
      `premium_features manque la clé "${featureKey}" (exécuter les migrations DB, dont 028 ou 030).`,
    );
  }

  const amt = Math.max(0, Number(amountMru) || 0);
  await pool.query(
    `INSERT INTO user_feature_wallets (user_id, feature_key, balance_mru, total_topped_up_mru)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (user_id, feature_key) DO UPDATE
       SET balance_mru         = user_feature_wallets.balance_mru + $3,
           total_topped_up_mru = user_feature_wallets.total_topped_up_mru + $3`,
    [userId, featureKey, amt],
  );
  await pool.query(
    `INSERT INTO feature_transactions (user_id, feature_key, amount_mru, type, description, request_id)
     VALUES ($1, $2, $3, 'topup', 'Recharge approuvée par admin', $4)`,
    [userId, featureKey, amt, requestId ?? null],
  );
  console.log(`[wallet] Topped up ${amountMru} MRU → user=${userId} feature=${featureKey}`);
  return hasPremiumFeature(userId, featureKey);
}

/**
 * Deduct MRU from a user's wallet after an AI operation.
 * Safe — clamps to 0 if balance insufficient.
 * Returns the updated wallet state.
 */
export async function deductFromWallet(
  userId: string,
  featureKey: string,
  amountMru: number,
  description: string,
  providerCostMru?: number | null,
): Promise<PremiumFeatureInfo> {
  const requestedAmount = Math.max(0, Number(amountMru) || 0);
  const originalKey = featureKey;

  // Universal wallet: debit it for any PAYG feature (if funded), then fallback to the feature wallet.
  if (featureKey !== UNIVERSAL_WALLET_KEY) {
    const u = await getWallet(userId, UNIVERSAL_WALLET_KEY);
    if (u.balanceMru > 0 && requestedAmount > 0) {
      featureKey = UNIVERSAL_WALLET_KEY;
      description = `${description} (feature=${originalKey})`;
    }
  }

  // Debit safely but record the *actual* deducted amount in the ledger.
  // (If balance is insufficient, we should not record a debit larger than the available balance.)
  const { rows } = await pool.query(
    `WITH current AS (
       SELECT balance_mru
       FROM user_feature_wallets
       WHERE user_id = $1 AND feature_key = $2
       FOR UPDATE
     ),
     upd AS (
       UPDATE user_feature_wallets w
       SET balance_mru     = GREATEST(0, w.balance_mru - $3),
           total_spent_mru = w.total_spent_mru + LEAST($3, w.balance_mru)
       WHERE w.user_id = $1 AND w.feature_key = $2
       RETURNING w.balance_mru
     )
     SELECT
       (SELECT balance_mru FROM upd)      AS balance_mru,
       LEAST($3, (SELECT balance_mru FROM current)) AS deducted_mru`,
    [userId, featureKey, requestedAmount],
  );
  if (rows.length) {
    const deducted = Number(rows[0].deducted_mru ?? 0) || 0;
    if (deducted > 0) {
      await pool.query(
        `INSERT INTO feature_transactions (user_id, feature_key, amount_mru, type, description, provider_cost_mru)
         VALUES ($1, $2, $3, 'debit', $4, $5)`,
        [userId, featureKey, -deducted, description, providerCostMru ?? null],
      );
    }
  }
  return hasPremiumFeature(userId, originalKey);
}

/**
 * Returns the pricing config for a feature (billing_unit + cost_per_unit_mru).
 * Falls back gracefully if columns don't exist yet.
 */
export async function getFeaturePricing(
  featureKey: string,
): Promise<{ billingUnit: string; costPerUnitMru: number }> {
  try {
    const { rows } = await pool.query(
      `SELECT billing_unit, cost_per_unit_mru FROM premium_features WHERE key = $1`,
      [featureKey],
    );
    if (!rows.length) return { billingUnit: 'per_use', costPerUnitMru: 10 };
    return {
      billingUnit:    rows[0].billing_unit    ?? 'per_use',
      costPerUnitMru: parseFloat(rows[0].cost_per_unit_mru ?? '10'),
    };
  } catch {
    return { billingUnit: 'per_use', costPerUnitMru: 10 };
  }
}

// ─── Referral Bonus ───────────────────────────────────────────────────────────

/**
 * Conditions (ALL must hold):
 *  1. inviteeUserId has a referrer (referred_by in users)
 *  2. referral_rewards row exists with bonus_paid = FALSE
 *  3. topupMru >= 50 MRU  (min deposit to trigger bonus)
 *  4. This is the invitee's FIRST approved top-up (previouslyApproved = 0)
 *
 * Bonus = min(topupMru × 2, 150 MRU) credited to referrer's same wallet.
 * Bonus expires in 45 days (stored in feature_transactions.expires_at).
 * referral_rewards.bonus_paid is set TRUE immediately to prevent double-trigger.
 */
export async function creditReferralBonusIfEligible(
  inviteeUserId: string,
  featureKey: string,
  topupMru: number,
  previouslyApprovedCount: number,
): Promise<void> {
  // Condition 1: must be first top-up ever for invitee
  if (previouslyApprovedCount > 0) return;

  // Condition 2: min deposit threshold
  if (topupMru < 50) return;

  // Condition 3: invitee must have been referred by someone
  const { rows: userRows } = await pool.query(
    `SELECT referred_by FROM users WHERE id = $1`,
    [inviteeUserId],
  );
  if (!userRows.length || !userRows[0].referred_by) return;
  const referrerId = userRows[0].referred_by as string;

  // Condition 4: bonus not yet paid (atomic UPDATE prevents race conditions)
  const { rowCount } = await pool.query(
    `UPDATE referral_rewards
     SET bonus_paid = TRUE, bonus_paid_at = NOW()
     WHERE referred_id = $1 AND bonus_paid = FALSE`,
    [inviteeUserId],
  );
  if (!rowCount || rowCount === 0) return; // already paid or no referral record

  // Calculate bonus: ×2 of first deposit, capped at 150 MRU
  const bonusMru = Math.min(topupMru * 2, 150);
  const expiresAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000); // +45 days

  // Credit referrer's wallet (same feature as the invitee topped up)
  await pool.query(
    `INSERT INTO user_feature_wallets (user_id, feature_key, balance_mru, total_topped_up_mru)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (user_id, feature_key) DO UPDATE
       SET balance_mru         = user_feature_wallets.balance_mru + $3,
           total_topped_up_mru = user_feature_wallets.total_topped_up_mru + $3`,
    [referrerId, featureKey, bonusMru],
  );

  // Record expiring transaction so the cron job can clean it up at day 45
  await pool.query(
    `INSERT INTO feature_transactions
       (user_id, feature_key, amount_mru, type, description, expires_at)
     VALUES ($1, $2, $3, 'referral_bonus',
             'Bonus parrainage — 1ère recharge de votre filleul (expire dans 45j)', $4)`,
    [referrerId, featureKey, bonusMru, expiresAt.toISOString()],
  );

  console.log(
    `[referral] Bonus ×2 parrainage: ${referrerId} → +${bonusMru} MRU (feature=${featureKey}, expires=${expiresAt.toDateString()}) ` +
    `triggered by invitee=${inviteeUserId} first deposit ${topupMru} MRU`,
  );
}

/**
 * @deprecated Use topUpWallet instead.
 * Kept for backward compatibility with older route code.
 */
export async function grantPremiumFeature(
  userId: string,
  featureKey: string,
  amountMruOrDays: number,
  requestId?: string,
): Promise<PremiumFeatureInfo> {
  return topUpWallet(userId, featureKey, amountMruOrDays, requestId);
}

/** Creates a fresh 7-day trial subscription for a brand-new user. */
export async function createTrialSubscription(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO subscriptions (user_id, trial_ends_at, effective_until)
     VALUES ($1, NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}
