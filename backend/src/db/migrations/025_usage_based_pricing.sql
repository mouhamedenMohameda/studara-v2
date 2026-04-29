-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 025 — Usage-based pricing
--
-- Replaces flat cost_per_use_mru with granular per-unit pricing:
--   whisper_studio  → per_minute   (cost per minute of audio)
--   ai_flashcards   → per_card     (cost per flashcard generated)
--   ai_course       → per_100_chars (cost per 100 chars of transcript processed)
--   ai_summary      → per_100_chars
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE premium_features
  ADD COLUMN IF NOT EXISTS billing_unit       TEXT             NOT NULL DEFAULT 'per_use',
  -- 'per_use' | 'per_minute' | 'per_card' | 'per_100_chars'
  ADD COLUMN IF NOT EXISTS cost_per_unit_mru  NUMERIC(8,2)     NOT NULL DEFAULT 10;

-- Whisper Studio: 2 MRU per minute → 100 MRU = 50 minutes of audio
UPDATE premium_features
SET billing_unit = 'per_minute', cost_per_unit_mru = 2
WHERE key = 'whisper_studio';

-- AI Flashcards: 1 MRU per card generated → 100 MRU = 100 cards
UPDATE premium_features
SET billing_unit = 'per_card', cost_per_unit_mru = 1
WHERE key = 'ai_flashcards';

-- AI Course summary: 1 MRU per 100 chars → 100 MRU = 10 000 chars (≈ 2 500 mots)
UPDATE premium_features
SET billing_unit = 'per_100_chars', cost_per_unit_mru = 1
WHERE key = 'ai_course';
