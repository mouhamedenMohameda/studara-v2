-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 042 — Universal PAYG wallet (single credit pool)
--
-- Adds a new "feature" key used as a universal wallet bucket:
--   key = 'wallet_universal'
-- The mobile app submits top-ups against this key, and server-side debits can
-- deduct from it for any PAYG functionality.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO premium_features (
  key,
  label_ar,
  label_fr,
  description_ar,
  description_fr,
  price_mru,
  duration_days,
  is_active,
  sort_order,
  cost_per_use_mru,
  min_recharge_mru,
  billing_unit,
  cost_per_unit_mru
)
VALUES (
  'wallet_universal',
  'محفظة الدفع حسب الاستخدام',
  'Wallet PAYG universel',
  'رصيد واحد يُستخدم لكل الميزات المدفوعة حسب الاستخدام.',
  'Un seul crédit utilisable pour toutes les fonctionnalités PAYG.',
  0,
  3650,
  TRUE,
  0,
  0,
  50,
  'per_use',
  0
)
ON CONFLICT (key) DO UPDATE
SET
  is_active = TRUE,
  sort_order = LEAST(premium_features.sort_order, 0),
  min_recharge_mru = LEAST(premium_features.min_recharge_mru, 50),
  billing_unit = 'per_use',
  cost_per_unit_mru = 0;

