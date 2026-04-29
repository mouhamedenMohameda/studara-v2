-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 043 — AI user activity history (summaries & exercise corrections)
--
-- Why: resource summaries are cached globally per resource; we still need a
-- per-user history of "what you generated".
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_user_activity (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT        NOT NULL CHECK (activity_type IN ('ai_summary', 'ai_exercise_correction')),
  resource_id   UUID        REFERENCES resources(id) ON DELETE SET NULL,
  correction_id UUID        REFERENCES ai_exercise_corrections(id) ON DELETE SET NULL,
  price_mru     INTEGER     NOT NULL DEFAULT 0,
  meta_json     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aiua_user_created ON ai_user_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aiua_user_type_created ON ai_user_activity(user_id, activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aiua_resource ON ai_user_activity(resource_id);
CREATE INDEX IF NOT EXISTS idx_aiua_correction ON ai_user_activity(correction_id);

-- Avoid duplicates for the same user+resource (summary) and user+correction (correction)
CREATE UNIQUE INDEX IF NOT EXISTS idx_aiua_user_resource_summary_unique
  ON ai_user_activity(user_id, resource_id)
  WHERE activity_type = 'ai_summary' AND resource_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_aiua_user_correction_unique
  ON ai_user_activity(user_id, correction_id)
  WHERE activity_type = 'ai_exercise_correction' AND correction_id IS NOT NULL;

