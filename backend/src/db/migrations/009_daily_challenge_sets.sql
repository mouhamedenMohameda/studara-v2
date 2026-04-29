-- Migration 009: Admin-Authored Daily Challenge Sets
-- Admins can pre-schedule challenge sets for specific dates, faculties and times.
-- The daily-challenge route checks this table first; falls back to seeded random.

CREATE TABLE IF NOT EXISTS daily_challenge_sets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date DATE        NOT NULL,
  faculty        VARCHAR(50) NOT NULL DEFAULT 'all',
  show_from_hour SMALLINT    NOT NULL DEFAULT 0  CHECK (show_from_hour BETWEEN 0 AND 23),
  time_limit_s   SMALLINT    NOT NULL DEFAULT 60 CHECK (time_limit_s BETWEEN 10 AND 3600),
  questions      JSONB       NOT NULL,           -- array of {front,options[4],correct_answer,subject?}
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_challenge_date_faculty UNIQUE (challenge_date, faculty)
);

CREATE INDEX IF NOT EXISTS idx_dcs_date_faculty
  ON daily_challenge_sets (challenge_date, faculty, is_active);

CREATE TRIGGER trg_dcs_updated
  BEFORE UPDATE ON daily_challenge_sets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
