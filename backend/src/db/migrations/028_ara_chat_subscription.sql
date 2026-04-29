-- Migration 028: Add ara_chat premium feature for AskZad subscription
-- Allows users to subscribe to Ara Premium via payment screenshot

-- Insert ara_chat feature (idempotent)
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
