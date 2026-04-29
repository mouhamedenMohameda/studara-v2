-- ─── Migration 001: Add missing tables + columns to bring DB in sync with schema.sql ─
-- Run once against the existing production database.
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS / DO $$ guards throughout.

-- ─── 1. Add video_course to resource_type enum ──────────────────────────────
DO $$ BEGIN
  ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'video_course';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Add missing columns to reminders ────────────────────────────────────
ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS scope        VARCHAR(20) NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('personal', 'global')),
  ADD COLUMN IF NOT EXISTS status       VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_reminders_scope_status ON reminders(scope, status);

-- ─── 3. Create job_type enum (idempotent) ────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE job_type AS ENUM ('stage', 'cdi', 'cdd', 'freelance', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 4. Create jobs table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(500)  NOT NULL,
  company      VARCHAR(255)  NOT NULL,
  location     VARCHAR(255),
  domain       VARCHAR(100),
  job_type     job_type      NOT NULL DEFAULT 'other',
  description  TEXT,
  requirements TEXT,
  apply_url    TEXT,
  deadline     DATE,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  posted_by    UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_active_created ON jobs(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_domain         ON jobs(domain);
CREATE INDEX IF NOT EXISTS idx_jobs_type           ON jobs(job_type);

DO $$ BEGIN
  CREATE INDEX idx_jobs_search ON jobs USING GIN(
    to_tsvector('simple', title || ' ' || company || ' ' || COALESCE(description, ''))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- updated_at trigger for jobs
DO $$ BEGIN
  CREATE TRIGGER trg_jobs_updated
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 5. Create flashcard_decks table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  subject    VARCHAR(200),
  color      VARCHAR(20)  NOT NULL DEFAULT '#8B5CF6',
  card_count INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user ON flashcard_decks(user_id);

DO $$ BEGIN
  CREATE TRIGGER trg_decks_updated
    BEFORE UPDATE ON flashcard_decks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 6. Create flashcards table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id       UUID    NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  front         TEXT    NOT NULL,
  back          TEXT    NOT NULL,
  ease_factor   REAL    NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 1,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  next_review   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck_review ON flashcards(deck_id, next_review);
