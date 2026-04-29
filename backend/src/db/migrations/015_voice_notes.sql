-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 015 — Whisper Studio : enregistrements vocaux & transcription IA
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS voice_notes (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Metadata provided by the client
  title           VARCHAR(200),
  subject         VARCHAR(100),
  duration_s      INTEGER,                          -- durée en secondes

  -- Processing pipeline
  status          VARCHAR(20)   NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'done', 'failed')),
  error_message   TEXT,                             -- raison si status=failed

  -- Content
  transcript      TEXT,                             -- sortie brute Groq Whisper
  enhanced_text   TEXT,                             -- résultat de l'amélioration IA
  enhance_mode    VARCHAR(20)                       -- summary | rewrite | flashcards
                  CHECK (enhance_mode IS NULL OR enhance_mode IN ('summary', 'rewrite', 'flashcards')),

  -- Deck généré depuis la transcription (si enhance_mode=flashcards)
  deck_id         UUID          REFERENCES flashcard_decks(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Lecture des notes par utilisateur (ordre anti-chrono)
CREATE INDEX IF NOT EXISTS idx_voice_notes_user_created
  ON voice_notes(user_id, created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_voice_note_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_notes_updated_at ON voice_notes;
CREATE TRIGGER trg_voice_notes_updated_at
  BEFORE UPDATE ON voice_notes
  FOR EACH ROW EXECUTE FUNCTION set_voice_note_updated_at();
