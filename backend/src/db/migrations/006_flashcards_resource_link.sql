-- Migration 006: link flashcard_decks to a source resource
-- Allows idempotent auto-generation (one deck per resource per user)

ALTER TABLE flashcard_decks
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_resource
  ON flashcard_decks(user_id, resource_id)
  WHERE resource_id IS NOT NULL;
