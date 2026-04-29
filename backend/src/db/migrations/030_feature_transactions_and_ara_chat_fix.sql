-- Fix admin approval failures for Ara / PAYG top-ups:
-- 1) Ensure ara_chat exists in premium_features (FK on user_feature_wallets).
-- 2) Allow referral_bonus in feature_transactions (code uses this type).

INSERT INTO premium_features (
  key, label_ar, label_fr,
  description_ar, description_fr,
  price_mru, duration_days,
  sort_order, is_active
) VALUES (
  'ara_chat',
  'أرا بريميوم',
  'Ara Premium',
  '٣٠٠ نقطة يومياً + جميع النماذج بلا حدود + الأولوية في الردود',
  '300 crédits/jour + tous les modèles IA + priorité dans les réponses',
  150,
  30,
  0,
  true
) ON CONFLICT (key) DO UPDATE
  SET label_ar       = EXCLUDED.label_ar,
      label_fr       = EXCLUDED.label_fr,
      description_ar = EXCLUDED.description_ar,
      description_fr = EXCLUDED.description_fr,
      is_active      = true;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'feature_transactions' AND c.contype = 'c'
  ) LOOP
    EXECUTE format('ALTER TABLE feature_transactions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE feature_transactions ADD CONSTRAINT feature_transactions_type_check
  CHECK (type IN ('topup', 'debit', 'refund', 'referral_bonus'));
