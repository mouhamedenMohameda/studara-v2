-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 046 — Support decimal MRU amounts in wallets & ledger
--
-- We need to debit in 0.2 MRU steps (0.4, 0.6, 2.0, ...), so wallet amounts
-- must be NUMERIC (not INTEGER).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_feature_wallets
  ALTER COLUMN balance_mru TYPE NUMERIC(10,2) USING balance_mru::numeric,
  ALTER COLUMN total_topped_up_mru TYPE NUMERIC(12,2) USING total_topped_up_mru::numeric,
  ALTER COLUMN total_spent_mru TYPE NUMERIC(12,2) USING total_spent_mru::numeric;

ALTER TABLE feature_transactions
  ALTER COLUMN amount_mru TYPE NUMERIC(12,2) USING amount_mru::numeric;

