-- Migration 011: Daily Challenge Prizes (winner payout workflow)
--
-- Flow:
-- 1) Winner submits payout info (phone + provider + full name) once, then it's locked.
-- 2) Admin uploads proof screenshot (visible to the winner).
-- 3) Winner confirms receipt, then the page becomes an immutable record.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_provider') THEN
    CREATE TYPE payout_provider AS ENUM ('bankily', 'sedad', 'masrivi');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS daily_challenge_prizes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  faculty           VARCHAR(50) NOT NULL DEFAULT 'all',
  challenge_date    DATE NOT NULL,

  -- winner performance snapshot (for history UI)
  time_taken_s      INT,
  referral_count    INT NOT NULL DEFAULT 0,

  -- payout info (locked after submit)
  phone             VARCHAR(30) NOT NULL,
  provider          payout_provider NOT NULL,
  account_full_name VARCHAR(120) NOT NULL,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- admin proof
  admin_proof_url   TEXT,
  admin_proof_uploaded_at TIMESTAMPTZ,
  admin_note        TEXT,

  -- user confirmation
  user_confirmed_at TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_dcp_user_day UNIQUE (user_id, challenge_date)
);

CREATE INDEX IF NOT EXISTS idx_dcp_date_faculty ON daily_challenge_prizes (challenge_date, faculty);
CREATE INDEX IF NOT EXISTS idx_dcp_confirmed    ON daily_challenge_prizes (user_confirmed_at);

CREATE TRIGGER trg_dcp_updated
  BEFORE UPDATE ON daily_challenge_prizes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

