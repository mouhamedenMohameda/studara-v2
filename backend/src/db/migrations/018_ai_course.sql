-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018 — Whisper Studio: AI Course Generation
-- Stores the full AI-generated course (from transcript + Wikipedia context)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS ai_course TEXT;          -- full structured course text

CREATE INDEX IF NOT EXISTS idx_voice_notes_ai_course
  ON voice_notes(user_id)
  WHERE ai_course IS NOT NULL;
