-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 029 — Subscription plans, entitlements, boosters, usage counters
-- MVP foundation for:
--   - 3 subscription plans
--   - additive boosters
--   - bucketed usage counters
--   - idempotent usage event ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT UNIQUE NOT NULL,
  display_name_fr       TEXT NOT NULL,
  description_fr        TEXT NOT NULL DEFAULT '',
  monthly_price_mru     INTEGER NOT NULL CHECK (monthly_price_mru >= 0),
  currency_code         TEXT NOT NULL DEFAULT 'MRU',
  billing_period_unit   TEXT NOT NULL DEFAULT 'month',
  billing_period_count  INTEGER NOT NULL DEFAULT 1 CHECK (billing_period_count > 0),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_sort
  ON subscription_plans (is_active, sort_order);

CREATE TABLE IF NOT EXISTS entitlement_definitions (
  key             TEXT PRIMARY KEY,
  value_type      TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'enum', 'json')),
  unit            TEXT,
  category        TEXT NOT NULL CHECK (category IN ('access', 'quota', 'limit', 'routing')),
  reset_policy    TEXT NOT NULL CHECK (reset_policy IN ('none', 'daily', 'billing_cycle', 'booster_window')),
  merge_strategy  TEXT NOT NULL CHECK (merge_strategy IN ('override', 'sum', 'max', 'or')),
  description     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_entitlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  entitlement_key  TEXT NOT NULL REFERENCES entitlement_definitions(key) ON DELETE CASCADE,
  value_json       JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, entitlement_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_entitlements_plan
  ON plan_entitlements (plan_id);

CREATE TABLE IF NOT EXISTS booster_definitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,
  display_name_fr  TEXT NOT NULL,
  description_fr   TEXT NOT NULL DEFAULT '',
  price_mru        INTEGER NOT NULL CHECK (price_mru >= 0),
  duration_days    INTEGER NOT NULL CHECK (duration_days > 0),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booster_definitions_active_sort
  ON booster_definitions (is_active, sort_order);

CREATE TABLE IF NOT EXISTS booster_entitlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booster_id       UUID NOT NULL REFERENCES booster_definitions(id) ON DELETE CASCADE,
  entitlement_key  TEXT NOT NULL REFERENCES entitlement_definitions(key) ON DELETE CASCADE,
  value_json       JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booster_id, entitlement_key)
);

CREATE INDEX IF NOT EXISTS idx_booster_entitlements_booster
  ON booster_entitlements (booster_id);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                  UUID NOT NULL REFERENCES subscription_plans(id),
  status                   TEXT NOT NULL CHECK (status IN ('active', 'grace', 'cancelled', 'expired', 'pending')),
  provider_ref             TEXT,
  source                   TEXT NOT NULL DEFAULT 'payment' CHECK (source IN ('payment', 'admin', 'migration', 'promo')),
  timezone                 TEXT NOT NULL DEFAULT 'Africa/Nouakchott',
  current_period_start_at  TIMESTAMPTZ NOT NULL,
  current_period_end_at    TIMESTAMPTZ NOT NULL,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT FALSE,
  next_plan_id             UUID REFERENCES subscription_plans(id),
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (current_period_end_at > current_period_start_at)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status_end
  ON user_subscriptions (user_id, status, current_period_end_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_single_active
  ON user_subscriptions (user_id)
  WHERE status IN ('active', 'grace');

CREATE TABLE IF NOT EXISTS booster_purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booster_id   UUID NOT NULL REFERENCES booster_definitions(id),
  status       TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  provider_ref TEXT,
  activated_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  source       TEXT NOT NULL DEFAULT 'payment' CHECK (source IN ('payment', 'admin', 'promo', 'migration')),
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'pending' AND activated_at IS NULL) OR (status <> 'pending' AND activated_at IS NOT NULL)),
  CHECK ((status = 'pending' AND expires_at IS NULL) OR (status <> 'pending' AND expires_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_booster_purchases_user_status_exp
  ON booster_purchases (user_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS admin_quota_credits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter_key  TEXT NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_admin_quota_credits_user_counter
  ON admin_quota_credits (user_id, counter_key, expires_at DESC);

CREATE TABLE IF NOT EXISTS user_usage_counters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter_key      TEXT NOT NULL,
  source_type      TEXT NOT NULL CHECK (source_type IN ('subscription', 'booster', 'admin_credit')),
  source_id        UUID NOT NULL,
  window_type      TEXT NOT NULL CHECK (window_type IN ('daily', 'billing_cycle', 'rolling_30d', 'fixed_window')),
  window_start_at  TIMESTAMPTZ NOT NULL,
  window_end_at    TIMESTAMPTZ NOT NULL,
  limit_total      INTEGER NOT NULL CHECK (limit_total >= 0),
  used_total       INTEGER NOT NULL DEFAULT 0 CHECK (used_total >= 0),
  reserved_total   INTEGER NOT NULL DEFAULT 0 CHECK (reserved_total >= 0),
  expires_at       TIMESTAMPTZ NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (window_end_at > window_start_at),
  CHECK (expires_at >= window_end_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_usage_counter_unique_bucket
  ON user_usage_counters (user_id, counter_key, source_type, source_id, window_start_at, window_end_at);

CREATE INDEX IF NOT EXISTS idx_user_usage_counter_lookup
  ON user_usage_counters (user_id, counter_key, window_end_at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   TEXT UNIQUE NOT NULL,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key       TEXT NOT NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN ('authorize', 'reserve', 'commit', 'release', 'reject', 'credit')),
  counter_key       TEXT,
  amount_requested  INTEGER NOT NULL DEFAULT 0 CHECK (amount_requested >= 0),
  amount_committed  INTEGER NOT NULL DEFAULT 0 CHECK (amount_committed >= 0),
  allocation_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'released', 'rejected')),
  request_ref       TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
  ON usage_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  plan_code   TEXT,
  platform    TEXT NOT NULL DEFAULT 'all' CHECK (platform IN ('mobile', 'web', 'all')),
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Seed: entitlement definitions ───────────────────────────────────────────
INSERT INTO entitlement_definitions (key, value_type, unit, category, reset_policy, merge_strategy, description)
VALUES
  ('chat_text_access',                 'boolean', NULL,       'access',  'none',          'or',       'Access to text chat'),
  ('standard_answer_access',           'boolean', NULL,       'access',  'none',          'or',       'Access to standard answers'),
  ('daily_ai_messages_limit',          'integer', 'messages', 'quota',   'daily',         'sum',      'Daily AI messages limit'),
  ('pdf_upload_access',                'boolean', NULL,       'access',  'none',          'or',       'Access to PDF upload'),
  ('monthly_pdf_analysis_limit',       'integer', 'pdf',      'quota',   'billing_cycle', 'sum',      'PDF analyses per cycle'),
  ('ocr_access',                       'boolean', NULL,       'access',  'none',          'or',       'Access to OCR'),
  ('monthly_ocr_pages_limit',          'integer', 'pages',    'quota',   'billing_cycle', 'sum',      'OCR pages per cycle'),
  ('premium_answers_monthly_limit',    'integer', 'answers',  'quota',   'billing_cycle', 'sum',      'Premium answers per cycle'),
  ('study_memory_access',              'boolean', NULL,       'access',  'none',          'or',       'Access to study memory'),
  ('memory_tier',                      'enum',    NULL,       'limit',   'none',          'override', 'none|medium|long'),
  ('active_revision_notebooks_limit',  'integer', 'notebooks','limit',   'none',          'sum',      'Active revision notebooks limit'),
  ('max_document_size_mb',             'integer', 'mb',       'limit',   'none',          'max',      'Maximum document size'),
  ('short_history_access',             'boolean', NULL,       'access',  'none',          'or',       'Short history'),
  ('long_context_access',              'boolean', NULL,       'access',  'none',          'or',       'Long context features'),
  ('priority_processing_access',       'boolean', NULL,       'routing', 'none',          'or',       'Priority heavy-task processing'),
  ('active_chat_threads_limit',        'integer', 'threads',  'limit',   'none',          'max',      'Maximum active chat threads')
ON CONFLICT (key) DO UPDATE
SET value_type = EXCLUDED.value_type,
    unit = EXCLUDED.unit,
    category = EXCLUDED.category,
    reset_policy = EXCLUDED.reset_policy,
    merge_strategy = EXCLUDED.merge_strategy,
    description = EXCLUDED.description;

-- ─── Seed: plan catalog ─────────────────────────────────────────────────────
INSERT INTO subscription_plans (code, display_name_fr, description_fr, monthly_price_mru, sort_order, is_active)
VALUES
  ('essential',   'Studara Essentiel',   'Questions IA, QCM, explications et resumes courts',                     199, 1, TRUE),
  ('course_pdf',  'Studara Cours & PDF', 'Tout Essentiel + PDF, OCR, resumes documentaires et dossiers revision', 299, 2, TRUE),
  ('revision_pro','Studara Revision Pro','Tout Cours & PDF + usage intensif, memoire longue, priorite',           399, 3, TRUE)
ON CONFLICT (code) DO UPDATE
SET display_name_fr = EXCLUDED.display_name_fr,
    description_fr = EXCLUDED.description_fr,
    monthly_price_mru = EXCLUDED.monthly_price_mru,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

-- ─── Seed: plan entitlements ────────────────────────────────────────────────
DELETE FROM plan_entitlements
WHERE plan_id IN (
  SELECT id FROM subscription_plans WHERE code IN ('essential', 'course_pdf', 'revision_pro')
);

WITH p AS (
  SELECT code, id FROM subscription_plans WHERE code IN ('essential', 'course_pdf', 'revision_pro')
)
INSERT INTO plan_entitlements (plan_id, entitlement_key, value_json)
SELECT p.id, x.entitlement_key, x.value_json
FROM p
JOIN (
  VALUES
    -- essential
    ('essential',    'chat_text_access',                'true'::jsonb),
    ('essential',    'standard_answer_access',          'true'::jsonb),
    ('essential',    'daily_ai_messages_limit',         '20'::jsonb),
    ('essential',    'pdf_upload_access',               'false'::jsonb),
    ('essential',    'monthly_pdf_analysis_limit',      '0'::jsonb),
    ('essential',    'ocr_access',                      'false'::jsonb),
    ('essential',    'monthly_ocr_pages_limit',         '0'::jsonb),
    ('essential',    'premium_answers_monthly_limit',   '0'::jsonb),
    ('essential',    'study_memory_access',             'false'::jsonb),
    ('essential',    'memory_tier',                     '"none"'::jsonb),
    ('essential',    'active_revision_notebooks_limit', '0'::jsonb),
    ('essential',    'max_document_size_mb',            '5'::jsonb),
    ('essential',    'short_history_access',            'true'::jsonb),
    ('essential',    'long_context_access',             'false'::jsonb),
    ('essential',    'priority_processing_access',      'false'::jsonb),
    ('essential',    'active_chat_threads_limit',       '3'::jsonb),
    -- course_pdf
    ('course_pdf',   'chat_text_access',                'true'::jsonb),
    ('course_pdf',   'standard_answer_access',          'true'::jsonb),
    ('course_pdf',   'daily_ai_messages_limit',         '20'::jsonb),
    ('course_pdf',   'pdf_upload_access',               'true'::jsonb),
    ('course_pdf',   'monthly_pdf_analysis_limit',      '40'::jsonb),
    ('course_pdf',   'ocr_access',                      'true'::jsonb),
    ('course_pdf',   'monthly_ocr_pages_limit',         '150'::jsonb),
    ('course_pdf',   'premium_answers_monthly_limit',   '20'::jsonb),
    ('course_pdf',   'study_memory_access',             'true'::jsonb),
    ('course_pdf',   'memory_tier',                     '"medium"'::jsonb),
    ('course_pdf',   'active_revision_notebooks_limit', '10'::jsonb),
    ('course_pdf',   'max_document_size_mb',            '25'::jsonb),
    ('course_pdf',   'short_history_access',            'true'::jsonb),
    ('course_pdf',   'long_context_access',             'false'::jsonb),
    ('course_pdf',   'priority_processing_access',      'false'::jsonb),
    ('course_pdf',   'active_chat_threads_limit',       '10'::jsonb),
    -- revision_pro
    ('revision_pro', 'chat_text_access',                'true'::jsonb),
    ('revision_pro', 'standard_answer_access',          'true'::jsonb),
    ('revision_pro', 'daily_ai_messages_limit',         '30'::jsonb),
    ('revision_pro', 'pdf_upload_access',               'true'::jsonb),
    ('revision_pro', 'monthly_pdf_analysis_limit',      '120'::jsonb),
    ('revision_pro', 'ocr_access',                      'true'::jsonb),
    ('revision_pro', 'monthly_ocr_pages_limit',         '400'::jsonb),
    ('revision_pro', 'premium_answers_monthly_limit',   '100'::jsonb),
    ('revision_pro', 'study_memory_access',             'true'::jsonb),
    ('revision_pro', 'memory_tier',                     '"long"'::jsonb),
    ('revision_pro', 'active_revision_notebooks_limit', '50'::jsonb),
    ('revision_pro', 'max_document_size_mb',            '75'::jsonb),
    ('revision_pro', 'short_history_access',            'true'::jsonb),
    ('revision_pro', 'long_context_access',             'true'::jsonb),
    ('revision_pro', 'priority_processing_access',      'true'::jsonb),
    ('revision_pro', 'active_chat_threads_limit',       '30'::jsonb)
) AS x(plan_code, entitlement_key, value_json)
  ON x.plan_code = p.code;

-- ─── Seed: boosters ─────────────────────────────────────────────────────────
INSERT INTO booster_definitions (code, display_name_fr, description_fr, price_mru, duration_days, sort_order, is_active)
VALUES
  ('pack_scans',            'Pack Scans',             '+100 pages OCR pendant 30 jours',                                           99, 30, 1, TRUE),
  ('pack_reponses_premium', 'Pack Reponses Premium',  '+30 reponses premium pendant 30 jours',                                     99, 30, 2, TRUE),
  ('pack_memoire_plus',     'Pack Memoire+',          '+20 dossiers de revision actifs pendant 30 jours',                          99, 30, 3, TRUE),
  ('pass_intensif_7j',      'Pass Intensif 7 jours',  '+15 messages/jour, +20 reponses premium, +100 scans, priorite 7 jours',  149, 7,  4, TRUE)
ON CONFLICT (code) DO UPDATE
SET display_name_fr = EXCLUDED.display_name_fr,
    description_fr = EXCLUDED.description_fr,
    price_mru = EXCLUDED.price_mru,
    duration_days = EXCLUDED.duration_days,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

DELETE FROM booster_entitlements
WHERE booster_id IN (
  SELECT id FROM booster_definitions WHERE code IN ('pack_scans', 'pack_reponses_premium', 'pack_memoire_plus', 'pass_intensif_7j')
);

WITH b AS (
  SELECT code, id FROM booster_definitions WHERE code IN ('pack_scans', 'pack_reponses_premium', 'pack_memoire_plus', 'pass_intensif_7j')
)
INSERT INTO booster_entitlements (booster_id, entitlement_key, value_json)
SELECT b.id, x.entitlement_key, x.value_json
FROM b
JOIN (
  VALUES
    ('pack_scans',            'monthly_ocr_pages_limit',         '100'::jsonb),
    ('pack_reponses_premium', 'premium_answers_monthly_limit',   '30'::jsonb),
    ('pack_memoire_plus',     'active_revision_notebooks_limit', '20'::jsonb),
    ('pass_intensif_7j',      'daily_ai_messages_limit',         '15'::jsonb),
    ('pass_intensif_7j',      'premium_answers_monthly_limit',   '20'::jsonb),
    ('pass_intensif_7j',      'monthly_ocr_pages_limit',         '100'::jsonb),
    ('pass_intensif_7j',      'priority_processing_access',      'true'::jsonb)
) AS x(booster_code, entitlement_key, value_json)
  ON x.booster_code = b.code;
