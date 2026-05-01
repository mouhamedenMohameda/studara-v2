-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 047 — Global app feature flags (admin-controlled)
--
-- Allows disabling ANY module in the mobile app (not only premium features).
-- Mobile reads flags and shows "bientôt" + disables navigation.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_features (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed common Home tiles (idempotent).
INSERT INTO app_features (key, label, is_active) VALUES
  ('resources', 'Resources', TRUE),
  ('timetable', 'Emploi du temps', TRUE),
  ('flashcards', 'Mes cartes', TRUE),
  ('reminders', 'Rappels', TRUE),
  ('focus', 'Focus', TRUE),
  ('daily', 'Défi du jour', TRUE),
  ('profile', 'Mon compte', TRUE),
  ('jobs', 'Emplois', TRUE),
  ('opportunities', 'Opportunités', TRUE),
  ('housing', 'Logement', TRUE),
  ('courses', 'Cours vidéo', TRUE),
  ('forum', 'Forum Q&A', TRUE),
  ('askzad', 'Assistant IA', TRUE),
  ('whisper', 'Whisper', TRUE),
  ('ai_summary', 'Résumé intelligent', TRUE),
  ('ai_exercise_correction', 'Correction IA', TRUE)
ON CONFLICT (key) DO NOTHING;

