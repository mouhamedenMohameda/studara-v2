-- Migration 013 — Resource community ratings (passive peer review)
-- Each user can rate an approved resource 1-5 stars (upsert).
-- Admin sees avg_rating + rating_count in the moderation panel.

CREATE TABLE IF NOT EXISTS resource_ratings (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  score       SMALLINT    NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (resource_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_ratings_resource
  ON resource_ratings (resource_id);

CREATE INDEX IF NOT EXISTS idx_resource_ratings_user
  ON resource_ratings (user_id);
