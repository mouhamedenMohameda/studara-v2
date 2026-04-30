-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 047 — Higher precision for PAYG amounts (up to 4 decimals)
--
-- Needed for transparent usage-based pricing (e.g. 0.0030 MRU).
-- Keeps wallet balances and ledger amounts consistent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_feature_wallets
  ALTER COLUMN balance_mru TYPE NUMERIC(12,4) USING balance_mru::numeric,
  ALTER COLUMN total_topped_up_mru TYPE NUMERIC(12,4) USING total_topped_up_mru::numeric,
  ALTER COLUMN total_spent_mru TYPE NUMERIC(12,4) USING total_spent_mru::numeric;

ALTER TABLE feature_transactions
  ALTER COLUMN amount_mru TYPE NUMERIC(12,4) USING amount_mru::numeric;

