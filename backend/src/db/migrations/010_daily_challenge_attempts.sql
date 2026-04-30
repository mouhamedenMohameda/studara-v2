-- Migration 010: Daily Challenge Attempts (server-timed)
-- Users can only START during the 5-minute daily window.
-- We store started_at and submitted_at to compute time_taken_s server-side.

CREATE TABLE IF NOT EXISTS daily_challenge_attempts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  faculty        VARCHAR(50) NOT NULL DEFAULT 'all',
  challenge_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at   TIMESTAMPTZ,
  time_limit_s   SMALLINT    NOT NULL DEFAULT 300,
  window_end_at  TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attempt_user_day UNIQUE (user_id, challenge_date)
);

CREATE INDEX IF NOT EXISTS idx_dca_date_faculty
  ON daily_challenge_attempts (challenge_date, faculty);

