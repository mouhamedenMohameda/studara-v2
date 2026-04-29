-- Migration 008: Daily Challenge (Wordle-style)
-- One score per user per day, resets at midnight UTC

CREATE TABLE IF NOT EXISTS daily_challenge_scores (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  faculty        VARCHAR(50) NOT NULL DEFAULT 'all',
  challenge_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  score          INTEGER     NOT NULL DEFAULT 0,
  correct        INTEGER     NOT NULL DEFAULT 0,
  total          INTEGER     NOT NULL DEFAULT 5,
  time_taken_s   INTEGER     NOT NULL DEFAULT 60,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_challenge_day UNIQUE (user_id, challenge_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_challenge_date_faculty
  ON daily_challenge_scores (challenge_date, faculty);

CREATE INDEX IF NOT EXISTS idx_daily_challenge_user
  ON daily_challenge_scores (user_id);
