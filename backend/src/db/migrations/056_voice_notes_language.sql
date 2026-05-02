-- Langue declaree par l'utilisateur pour Whisper Studio (transcript + flashcards alignes)

ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS language VARCHAR(2)
    CHECK (language IS NULL OR language IN ('ar', 'fr'));

COMMENT ON COLUMN voice_notes.language IS 'Langue declaree au moment du chargement/ar (ar | fr); obligatoire pour les nouvelles notes.';
