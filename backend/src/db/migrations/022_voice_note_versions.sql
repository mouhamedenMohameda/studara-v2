-- Migration 022: transcript version history for voice notes
-- Stores an array of previous transcripts so the user can revert to any past version.

ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS transcript_versions JSONB NOT NULL DEFAULT '[]';
