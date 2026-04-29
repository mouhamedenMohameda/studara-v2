-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 017 — Whisper Studio: OpenAI structured enhancement columns
-- ─────────────────────────────────────────────────────────────────────────────

-- Store which transcription model was used (for auditing & cost tracking)
ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS transcription_model VARCHAR(60);

-- Structured enhancement output (from gpt-5.4 mini / nano)
ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS clean_transcript   TEXT;        -- corrected transcript

ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS summary            TEXT;        -- lecture summary

ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS action_items       JSONB        -- string[]
  DEFAULT '[]'::jsonb;

ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS key_topics         JSONB        -- string[]
  DEFAULT '[]'::jsonb;

ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS unclear_segments   JSONB        -- string[]
  DEFAULT '[]'::jsonb;

-- Index to allow querying notes that have been enhanced
CREATE INDEX IF NOT EXISTS idx_voice_notes_enhance_mode
  ON voice_notes(user_id, enhance_mode)
  WHERE enhance_mode IS NOT NULL;
