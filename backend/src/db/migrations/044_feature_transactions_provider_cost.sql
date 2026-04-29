-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 044 — Track provider cost on each transaction
--
-- `amount_mru` = what we charge / credit to the user wallet.
-- `provider_cost_mru` = our estimated real cost for the operation (MRU).
-- Keep nullable for legacy rows.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE feature_transactions
  ADD COLUMN IF NOT EXISTS provider_cost_mru NUMERIC(10,4);

