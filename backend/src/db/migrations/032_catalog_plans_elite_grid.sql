-- 032: Grille commerciale Studara — prix, textes marketing, Elite Pass 7j + Elite Mensuel, fin Révision Pro catalogue actif

-- Nouveaux plans (idempotent)
INSERT INTO subscription_plans (
  code, display_name_fr, description_fr, monthly_price_mru, currency_code,
  billing_period_unit, billing_period_count, sort_order, is_active
)
VALUES
  (
    'elite_pass_7d',
    'Studara Elite Pass Hebdo',
    'Pour une semaine de révision intensive avec plus de puissance, plus de mémoire et plus de traitement premium.',
    349,
    'MRU',
    'day',
    7,
    3,
    TRUE
  ),
  (
    'elite_monthly',
    'Studara Elite Mensuel',
    'Pour les gros utilisateurs qui veulent la version la plus avancée sur tout le mois.',
    1000,
    'MRU',
    'month',
    1,
    4,
    TRUE
  )
ON CONFLICT (code) DO UPDATE SET
  display_name_fr       = EXCLUDED.display_name_fr,
  description_fr        = EXCLUDED.description_fr,
  monthly_price_mru     = EXCLUDED.monthly_price_mru,
  billing_period_unit   = EXCLUDED.billing_period_unit,
  billing_period_count  = EXCLUDED.billing_period_count,
  sort_order            = EXCLUDED.sort_order,
  is_active             = EXCLUDED.is_active,
  updated_at            = NOW();

-- Abonnés actifs encore sur Révision Pro → Elite Mensuel
UPDATE user_subscriptions us
SET plan_id     = (SELECT id FROM subscription_plans WHERE code = 'elite_monthly' LIMIT 1),
    updated_at  = NOW(),
    metadata    = COALESCE(us.metadata, '{}'::jsonb) || '{"migrated_from_plan":"revision_pro"}'::jsonb
WHERE plan_id = (SELECT id FROM subscription_plans WHERE code = 'revision_pro' LIMIT 1)
  AND status IN ('active', 'grace');

-- Retrait du catalogue pour Révision Pro (lignes historiques / entitlements conservés)
UPDATE subscription_plans
SET is_active = FALSE, updated_at = NOW()
WHERE code = 'revision_pro';

-- Essentiel & Cours & PDF : prix + textes marketing
UPDATE subscription_plans
SET
  monthly_price_mru   = 150,
  display_name_fr     = 'Studara Essentiel',
  description_fr      = 'Pour réviser au quotidien avec l''IA, poser des questions, générer des QCM et obtenir des explications claires.',
  sort_order          = 1,
  billing_period_unit = 'month',
  billing_period_count = 1,
  updated_at          = NOW()
WHERE code = 'essential';

UPDATE subscription_plans
SET
  monthly_price_mru   = 250,
  display_name_fr     = 'Studara Cours & PDF',
  description_fr      = 'Pour travailler directement sur tes cours, PDF et scans, avec une IA plus utile pour les documents.',
  sort_order          = 2,
  updated_at          = NOW()
WHERE code = 'course_pdf';

-- Réinitialiser les entitlements des 4 offres catalogue actives
DELETE FROM plan_entitlements
WHERE plan_id IN (
  SELECT id FROM subscription_plans WHERE code IN ('essential', 'course_pdf', 'elite_pass_7d', 'elite_monthly')
);

WITH p AS (
  SELECT code, id FROM subscription_plans WHERE code IN ('essential', 'course_pdf', 'elite_pass_7d', 'elite_monthly')
)
INSERT INTO plan_entitlements (plan_id, entitlement_key, value_json)
SELECT p.id, x.entitlement_key, x.value_json
FROM p
JOIN (
  VALUES
    ('essential', 'chat_text_access',                'true'::jsonb),
    ('essential', 'standard_answer_access',          'true'::jsonb),
    ('essential', 'daily_ai_messages_limit',         '20'::jsonb),
    ('essential', 'pdf_upload_access',               'false'::jsonb),
    ('essential', 'monthly_pdf_analysis_limit',      '0'::jsonb),
    ('essential', 'ocr_access',                      'false'::jsonb),
    ('essential', 'monthly_ocr_pages_limit',         '0'::jsonb),
    ('essential', 'premium_answers_monthly_limit',   '0'::jsonb),
    ('essential', 'study_memory_access',             'false'::jsonb),
    ('essential', 'memory_tier',                     '"none"'::jsonb),
    ('essential', 'active_revision_notebooks_limit', '0'::jsonb),
    ('essential', 'max_document_size_mb',            '5'::jsonb),
    ('essential', 'short_history_access',            'true'::jsonb),
    ('essential', 'long_context_access',             'false'::jsonb),
    ('essential', 'priority_processing_access',      'false'::jsonb),
    ('essential', 'active_chat_threads_limit',       '3'::jsonb),
    ('essential', 'deep_model_access',               'false'::jsonb),

    ('course_pdf', 'chat_text_access',                'true'::jsonb),
    ('course_pdf', 'standard_answer_access',          'true'::jsonb),
    ('course_pdf', 'daily_ai_messages_limit',         '20'::jsonb),
    ('course_pdf', 'pdf_upload_access',               'true'::jsonb),
    ('course_pdf', 'monthly_pdf_analysis_limit',      '40'::jsonb),
    ('course_pdf', 'ocr_access',                      'true'::jsonb),
    ('course_pdf', 'monthly_ocr_pages_limit',         '150'::jsonb),
    ('course_pdf', 'premium_answers_monthly_limit',   '20'::jsonb),
    ('course_pdf', 'study_memory_access',             'true'::jsonb),
    ('course_pdf', 'memory_tier',                     '"medium"'::jsonb),
    ('course_pdf', 'active_revision_notebooks_limit', '10'::jsonb),
    ('course_pdf', 'max_document_size_mb',            '15'::jsonb),
    ('course_pdf', 'short_history_access',            'true'::jsonb),
    ('course_pdf', 'long_context_access',             'false'::jsonb),
    ('course_pdf', 'priority_processing_access',      'false'::jsonb),
    ('course_pdf', 'active_chat_threads_limit',       '10'::jsonb),
    ('course_pdf', 'deep_model_access',               'true'::jsonb),

    ('elite_pass_7d', 'chat_text_access',                'true'::jsonb),
    ('elite_pass_7d', 'standard_answer_access',          'true'::jsonb),
    ('elite_pass_7d', 'daily_ai_messages_limit',         '50'::jsonb),
    ('elite_pass_7d', 'pdf_upload_access',               'true'::jsonb),
    ('elite_pass_7d', 'monthly_pdf_analysis_limit',      '25'::jsonb),
    ('elite_pass_7d', 'ocr_access',                      'true'::jsonb),
    ('elite_pass_7d', 'monthly_ocr_pages_limit',         '120'::jsonb),
    ('elite_pass_7d', 'premium_answers_monthly_limit',   '35'::jsonb),
    ('elite_pass_7d', 'study_memory_access',             'true'::jsonb),
    ('elite_pass_7d', 'memory_tier',                     '"long"'::jsonb),
    ('elite_pass_7d', 'active_revision_notebooks_limit', '15'::jsonb),
    ('elite_pass_7d', 'max_document_size_mb',            '25'::jsonb),
    ('elite_pass_7d', 'short_history_access',            'true'::jsonb),
    ('elite_pass_7d', 'long_context_access',             'true'::jsonb),
    ('elite_pass_7d', 'priority_processing_access',      'true'::jsonb),
    ('elite_pass_7d', 'active_chat_threads_limit',       '15'::jsonb),
    ('elite_pass_7d', 'deep_model_access',               'true'::jsonb),

    ('elite_monthly', 'chat_text_access',                'true'::jsonb),
    ('elite_monthly', 'standard_answer_access',          'true'::jsonb),
    ('elite_monthly', 'daily_ai_messages_limit',         '40'::jsonb),
    ('elite_monthly', 'pdf_upload_access',               'true'::jsonb),
    ('elite_monthly', 'monthly_pdf_analysis_limit',      '150'::jsonb),
    ('elite_monthly', 'ocr_access',                      'true'::jsonb),
    ('elite_monthly', 'monthly_ocr_pages_limit',         '600'::jsonb),
    ('elite_monthly', 'premium_answers_monthly_limit',   '300'::jsonb),
    ('elite_monthly', 'study_memory_access',             'true'::jsonb),
    ('elite_monthly', 'memory_tier',                     '"long"'::jsonb),
    ('elite_monthly', 'active_revision_notebooks_limit', '80'::jsonb),
    ('elite_monthly', 'max_document_size_mb',            '40'::jsonb),
    ('elite_monthly', 'short_history_access',            'true'::jsonb),
    ('elite_monthly', 'long_context_access',             'true'::jsonb),
    ('elite_monthly', 'priority_processing_access',      'true'::jsonb),
    ('elite_monthly', 'active_chat_threads_limit',       '30'::jsonb),
    ('elite_monthly', 'deep_model_access',               'true'::jsonb)
) AS x(plan_code, entitlement_key, value_json)
  ON x.plan_code = p.code;
