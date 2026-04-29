-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 024 — Pay-as-you-go (PAYG) Wallet System
--
-- Replaces the time-based subscription model with a balance-based wallet.
-- Each feature has its own MRU wallet per user.
--
-- Flow:
--   1. User picks a feature → sees current balance + how much to recharge
--   2. User pays any amount via Bankily (42986738) or Sedad (32164356)
--   3. User submits screenshot with topup_amount_mru
--   4. Admin approves → wallet credited with that amount
--   5. App deducts from wallet on each AI operation
--   6. User sees real-time balance + consumption bar
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add per-use cost + min recharge to premium_features ───────────────────
ALTER TABLE premium_features
  ADD COLUMN IF NOT EXISTS cost_per_use_mru  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS min_recharge_mru  INTEGER NOT NULL DEFAULT 100;

-- Update costs per feature operation
--   whisper_studio : 5 MRU per minute of audio transcribed
--   ai_flashcards  : 10 MRU per generation
--   ai_course      : 20 MRU per generation
UPDATE premium_features SET cost_per_use_mru =  5, min_recharge_mru = 100 WHERE key = 'whisper_studio';
UPDATE premium_features SET cost_per_use_mru = 10, min_recharge_mru = 100 WHERE key = 'ai_flashcards';
UPDATE premium_features SET cost_per_use_mru = 20, min_recharge_mru = 100 WHERE key = 'ai_course';

-- ── 2. User wallets (one row per user × feature) ─────────────────────────────
CREATE TABLE IF NOT EXISTS user_feature_wallets (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key          TEXT        NOT NULL REFERENCES premium_features(key) ON DELETE CASCADE,
  balance_mru          INTEGER     NOT NULL DEFAULT 0 CHECK (balance_mru >= 0),
  total_topped_up_mru  INTEGER     NOT NULL DEFAULT 0,  -- lifetime recharged
  total_spent_mru      INTEGER     NOT NULL DEFAULT 0,  -- lifetime spent
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ufw_user_feature_unique UNIQUE (user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_ufw_user    ON user_feature_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_ufw_feature ON user_feature_wallets(feature_key);

CREATE TRIGGER trg_ufw_updated
  BEFORE UPDATE ON user_feature_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. Transaction ledger (every credit and debit) ───────────────────────────
CREATE TABLE IF NOT EXISTS feature_transactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key TEXT        NOT NULL REFERENCES premium_features(key) ON DELETE CASCADE,
  amount_mru  INTEGER     NOT NULL,   -- positive = credit (topup), negative = debit (usage)
  type        TEXT        NOT NULL CHECK (type IN ('topup', 'debit', 'refund')),
  description TEXT,
  request_id  UUID        REFERENCES premium_feature_requests(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ft_user    ON feature_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ft_feature ON feature_transactions(feature_key);
CREATE INDEX IF NOT EXISTS idx_ft_created ON feature_transactions(created_at DESC);

-- ── 4. Add topup_amount_mru to feature requests ───────────────────────────────
--    This is the amount the user claims to have sent.
--    On admin approval, wallet is credited with this amount.
ALTER TABLE premium_feature_requests
  ADD COLUMN IF NOT EXISTS topup_amount_mru INTEGER;

-- Backfill from amount_paid_mru where available
UPDATE premium_feature_requests
  SET topup_amount_mru = amount_paid_mru
  WHERE amount_paid_mru IS NOT NULL AND topup_amount_mru IS NULL;
