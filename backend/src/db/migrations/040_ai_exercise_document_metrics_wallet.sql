-- Metrics for exercise-correction pricing + PAYG wallet feature key

ALTER TABLE ai_exercise_documents
  ADD COLUMN IF NOT EXISTS page_count INT,
  ADD COLUMN IF NOT EXISTS word_count INT;

COMMENT ON COLUMN ai_exercise_documents.page_count IS 'PDF pages or 1 for photo OCR; NULL for pasted text-only.';
COMMENT ON COLUMN ai_exercise_documents.word_count IS 'Word count of statement_text (normalized) at extraction time.';

INSERT INTO premium_features (
  key, label_ar, label_fr,
  description_ar, description_fr,
  price_mru, duration_days,
  sort_order, is_active,
  billing_unit, cost_per_unit_mru
) VALUES (
  'ai_exercise_correction',
  'تصحيح تمارين بالذكاء الاصطناعي',
  'Correction IA d''exercices',
  'تصحيح مفصل حسب الحجم (صفحات/كلمات) مع دفع بالأوقية',
  'Correction détaillée tarifée selon la taille (pages/mots), paiement en MRU',
  200,
  180,
  5,
  true,
  'per_use',
  1
) ON CONFLICT (key) DO UPDATE
  SET label_ar       = EXCLUDED.label_ar,
      label_fr       = EXCLUDED.label_fr,
      description_ar = EXCLUDED.description_ar,
      description_fr = EXCLUDED.description_fr,
      is_active      = true;
