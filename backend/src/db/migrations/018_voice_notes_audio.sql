-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018 — Whisper Studio: conserver le fichier audio pour lecture
-- ─────────────────────────────────────────────────────────────────────────────

-- Nom du fichier audio conservé sur le serveur (UUID.m4a).
-- NULL = note créée avant cette migration ou fichier non conservé.
ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS audio_filename VARCHAR(200);
