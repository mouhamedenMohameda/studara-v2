-- Migration 010: add show_from_minute to daily_challenge_sets
ALTER TABLE daily_challenge_sets
  ADD COLUMN IF NOT EXISTS show_from_minute SMALLINT NOT NULL DEFAULT 0
  CHECK (show_from_minute BETWEEN 0 AND 59);
