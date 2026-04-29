-- 034: VIP entitlement + feature-level routing config (MVP)
--
-- Goal: enable/disable routing behavior per plan/feature without exposing model names.
-- Used via feature_flags (operational overrides) and future admin UI.

-- VIP access entitlement (gates VIP tier)
INSERT INTO entitlement_definitions (key, value_type, unit, category, reset_policy, merge_strategy, description)
VALUES (
  'vip_model_access',
  'boolean',
  NULL,
  'routing',
  'none',
  'or',
  'Allows VIP routing tier (ultra-limited). Never a default.'
)
ON CONFLICT (key) DO UPDATE SET
  value_type = EXCLUDED.value_type,
  category = EXCLUDED.category,
  reset_policy = EXCLUDED.reset_policy,
  merge_strategy = EXCLUDED.merge_strategy,
  description = EXCLUDED.description;

-- Minimal feature config table (internal knobs; no model info)
CREATE TABLE IF NOT EXISTS ai_feature_configs (
  id          BIGSERIAL PRIMARY KEY,
  feature_key TEXT NOT NULL,                 -- e.g. 'chat_http'
  plan_code   TEXT NULL,                     -- null = global default
  enabled     BOOLEAN NOT NULL DEFAULT TRUE, -- kill switch
  config      JSONB NOT NULL DEFAULT '{}'::jsonb, -- thresholds, caps, etc.
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feature_key, plan_code)
);

CREATE INDEX IF NOT EXISTS idx_ai_feature_configs_feature
  ON ai_feature_configs (feature_key);

