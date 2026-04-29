-- Migration 007: Referral / Parrainage
-- Tracks who referred whom and prevents double-credit

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS referral_rewards (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rewarded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referred_id)   -- one reward per new user (prevents double-credit)
);

CREATE INDEX IF NOT EXISTS idx_referral_referrer ON referral_rewards(referrer_id);
