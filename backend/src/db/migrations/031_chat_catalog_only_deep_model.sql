-- 031: Chat catalogue uniquement — entitlement modele profond + sunset Ara Premium (capture)

INSERT INTO entitlement_definitions (key, value_type, unit, category, reset_policy, merge_strategy, description)
VALUES (
  'deep_model_access',
  'boolean',
  NULL,
  'access',
  'none',
  'or',
  'Acces au mode reponse profonde (Ara) dans le chat HTTP sans quota messages'
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  merge_strategy = EXCLUDED.merge_strategy;

INSERT INTO plan_entitlements (plan_id, entitlement_key, value_json)
SELECT sp.id, 'deep_model_access', 'false'::jsonb
FROM subscription_plans sp
WHERE sp.code = 'essential'
ON CONFLICT (plan_id, entitlement_key) DO UPDATE SET value_json = EXCLUDED.value_json;

INSERT INTO plan_entitlements (plan_id, entitlement_key, value_json)
SELECT sp.id, 'deep_model_access', 'true'::jsonb
FROM subscription_plans sp
WHERE sp.code IN ('course_pdf', 'revision_pro')
ON CONFLICT (plan_id, entitlement_key) DO UPDATE SET value_json = EXCLUDED.value_json;

UPDATE premium_features
SET is_active = false
WHERE key = 'ara_chat';
