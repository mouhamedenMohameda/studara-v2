/**
 * Cron job: expire referral bonuses after 45 days.
 *
 * Runs daily at 02:00 UTC.
 *
 * For each feature_transactions row where:
 *   - type = 'referral_bonus'
 *   - expires_at <= NOW()
 *   - bonus_expired = FALSE
 *
 * We deduct the bonus amount from the user's wallet (clamped to 0 if already spent)
 * and mark the transaction as expired so it is never processed again.
 *
 * This is safe to run multiple times (idempotent via bonus_expired flag).
 */

import cron from 'node-cron';
import pool from '../db/pool';

export async function runExpireReferralBonuses(): Promise<void> {
  // Fetch all un-expired bonus transactions that are now past their expiry date
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    feature_key: string;
    amount_mru: number;
  }>(
    `SELECT id, user_id, feature_key, amount_mru
     FROM feature_transactions
     WHERE type = 'referral_bonus'
       AND bonus_expired = FALSE
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`,
  );

  if (!rows.length) return;

  console.log(`[expireReferralBonuses] Processing ${rows.length} expired bonus(es)...`);

  for (const tx of rows) {
    try {
      // Deduct the bonus amount from the wallet (clamped to 0 — user may have spent it)
      await pool.query(
        `UPDATE user_feature_wallets
         SET balance_mru = GREATEST(0, balance_mru - $3)
         WHERE user_id = $1 AND feature_key = $2`,
        [tx.user_id, tx.feature_key, tx.amount_mru],
      );

      // Record the expiry debit for transaction history
      await pool.query(
        `INSERT INTO feature_transactions
           (user_id, feature_key, amount_mru, type, description)
         VALUES ($1, $2, $3, 'referral_bonus_expired',
                 'Bonus parrainage expiré (45j écoulés)')`,
        [tx.user_id, tx.feature_key, -tx.amount_mru],
      );

      // Mark original bonus transaction as expired (prevents double-processing)
      await pool.query(
        `UPDATE feature_transactions SET bonus_expired = TRUE WHERE id = $1`,
        [tx.id],
      );

      console.log(
        `[expireReferralBonuses] Expired ${tx.amount_mru} MRU bonus for user=${tx.user_id} feature=${tx.feature_key}`,
      );
    } catch (e) {
      console.error(`[expireReferralBonuses] Failed for tx=${tx.id}:`, e);
    }
  }
}

/** Schedules the expiry job. Returns the task so caller can stop it on shutdown. */
export function startExpireReferralBonusesCron(): ReturnType<typeof cron.schedule> {
  // Run every day at 02:00 UTC
  const task = cron.schedule('0 2 * * *', async () => {
    try {
      await runExpireReferralBonuses();
    } catch (e) {
      console.error('[expireReferralBonuses] Cron error:', e);
    }
  });

  console.log('[expireReferralBonuses] Cron scheduled: daily at 02:00 UTC');
  return task;
}
