-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002 — Billing / Subscription
-- Every user gets a 7-day free trial at registration.
-- Each resource they upload that gets APPROVED by an admin gives them +1 bonus
-- day on top of whatever subscription they have.
-- Admins can also manually extend a subscription via paid_until.
-- ─────────────────────────────────────────────────────────────────────────────

-- Status enum
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main table
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Trial window (set once at registration, never changes)
  trial_ends_at          TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  -- Paid window (NULL until a payment is made / admin grants one)
  paid_until             TIMESTAMPTZ,
  -- Bonus days earned from approved uploads (each approved file = +1 day)
  accepted_uploads_count INTEGER     NOT NULL DEFAULT 0,
  bonus_days             INTEGER     NOT NULL DEFAULT 0,
  -- Computed effective expiry stored for quick queries (recalculated on every update)
  effective_until        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscriptions_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user            ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_effective_until ON subscriptions(effective_until);

-- Reuse the existing set_updated_at trigger function
CREATE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Populate existing users (7-day trial counted from their registration date)
INSERT INTO subscriptions (user_id, trial_ends_at, effective_until)
SELECT
  id,
  created_at + INTERVAL '7 days',
  created_at + INTERVAL '7 days'
FROM users
ON CONFLICT (user_id) DO NOTHING;
