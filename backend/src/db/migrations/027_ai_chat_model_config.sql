-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 027 — AI Chat Model Configuration
--
-- Stores configurable per-model settings for the Ara chatbot:
--   credit_cost           — credits charged per message
--   max_context_messages  — how many past messages to send to the model
--   max_output_tokens     — max tokens in the model's reply
--   is_enabled            — whether the model is available to users
--   daily_quota           — default daily quota (can be overridden per plan)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_chat_model_config (
  model_id              TEXT        PRIMARY KEY,   -- 'ara' | 'deepseek' | 'gpt'
  display_name          TEXT        NOT NULL,
  credit_cost           INTEGER     NOT NULL DEFAULT 1,
  max_context_messages  INTEGER     NOT NULL DEFAULT 12,
  max_output_tokens     INTEGER     NOT NULL DEFAULT 1000,
  daily_quota           INTEGER     NOT NULL DEFAULT 150,
  is_enabled            BOOLEAN     NOT NULL DEFAULT true,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default values (matching the hardcoded values in ai.ts)
INSERT INTO ai_chat_model_config
  (model_id, display_name, credit_cost, max_context_messages, max_output_tokens, daily_quota)
VALUES
  ('ara',      'Ara (Claude Haiku)',  3, 16, 1500, 150),
  ('deepseek', 'DeepSeek Chat',       1, 12, 1000, 150),
  ('gpt',      'GPT-4o Mini',         2, 12, 1000, 150)
ON CONFLICT (model_id) DO NOTHING;
