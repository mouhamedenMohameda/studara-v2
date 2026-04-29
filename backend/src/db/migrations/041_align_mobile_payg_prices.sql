-- Align PAYG per-use pricing with mobile `PAYG_FEATURES`.
-- Note: Whisper per-model pricing is handled in voiceNotes.ts via model_pricing_overrides,
-- not via premium_features.cost_per_unit_mru.

UPDATE premium_features
SET billing_unit = 'per_use', cost_per_unit_mru = 0.62
WHERE key = 'ai_flashcards';

UPDATE premium_features
SET billing_unit = 'per_use', cost_per_unit_mru = 0.81
WHERE key = 'ai_course';

-- If the feature exists in premium_features, keep it aligned too.
UPDATE premium_features
SET billing_unit = 'per_use', cost_per_unit_mru = 0.96
WHERE key IN ('ai_summary_pdf', 'ai_summary');

