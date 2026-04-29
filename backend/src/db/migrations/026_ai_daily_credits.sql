-- Migration 026: AI daily credit quota tracking per user
-- Tracks how many IA credits each user has consumed per day.
-- Credits reset automatically (new row each day).

CREATE TABLE IF NOT EXISTS ai_daily_credits (
  user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date      DATE        NOT NULL,
  credits_used INTEGER  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_daily_credits_user_date
  ON ai_daily_credits (user_id, date);
