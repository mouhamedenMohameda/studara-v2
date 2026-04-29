-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE user_role      AS ENUM ('student', 'teacher', 'moderator', 'admin');
CREATE TYPE resource_type  AS ENUM ('note', 'past_exam', 'summary', 'exercise', 'project', 'presentation', 'video_course');
CREATE TYPE resource_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE reminder_type  AS ENUM ('exam', 'assignment', 'course', 'other');

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  full_name_ar    VARCHAR(255),
  phone           VARCHAR(50),
  avatar_url      TEXT,
  university      VARCHAR(50)  NOT NULL,
  faculty         VARCHAR(50)  NOT NULL,
  year            SMALLINT     NOT NULL CHECK (year BETWEEN 1 AND 7),
  role            user_role    NOT NULL DEFAULT 'student',
  language        VARCHAR(5)   NOT NULL DEFAULT 'ar',
  is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_banned       BOOLEAN      NOT NULL DEFAULT FALSE,
  total_uploads   INTEGER      NOT NULL DEFAULT 0,
  total_downloads INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ─── Resources ────────────────────────────────────────────────────────────────
CREATE TABLE resources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(500)    NOT NULL,
  title_ar         VARCHAR(500),
  description      TEXT,
  resource_type    resource_type   NOT NULL,
  faculty          VARCHAR(50)     NOT NULL,
  university       VARCHAR(50)     NOT NULL,
  subject          VARCHAR(255)    NOT NULL,
  year             SMALLINT        NOT NULL CHECK (year BETWEEN 1 AND 7),
  file_url         TEXT,
  file_name        VARCHAR(255),
  file_size        BIGINT,
  file_type        VARCHAR(50),
  uploaded_by      UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           resource_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  moderated_by     UUID REFERENCES users(id),
  moderated_at     TIMESTAMPTZ,
  downloads        INTEGER         NOT NULL DEFAULT 0,
  likes            INTEGER         NOT NULL DEFAULT 0,
  tags             TEXT[]          NOT NULL DEFAULT '{}',
  search_vector    TSVECTOR,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION update_resource_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.title_ar, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.subject, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'C') ||
    setweight(to_tsvector('simple', array_to_string(NEW.tags, ' ')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_resource_search
  BEFORE INSERT OR UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_resource_search_vector();

CREATE INDEX idx_resources_search     ON resources USING GIN(search_vector);
CREATE INDEX idx_resources_faculty    ON resources(faculty);
CREATE INDEX idx_resources_university ON resources(university);
CREATE INDEX idx_resources_type       ON resources(resource_type);
CREATE INDEX idx_resources_status     ON resources(status);
CREATE INDEX idx_resources_uploader   ON resources(uploaded_by);

-- ─── Resource Likes & Bookmarks ───────────────────────────────────────────────
CREATE TABLE resource_likes (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, resource_id)
);

CREATE TABLE resource_bookmarks (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, resource_id)
);

-- ─── Timetable ────────────────────────────────────────────────────────────────
CREATE TABLE timetable_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  name_ar       VARCHAR(255),
  teacher       VARCHAR(255),
  room          VARCHAR(100),
  color         VARCHAR(7)   NOT NULL DEFAULT '#3B82F6',
  day_of_week   SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,
  semester      SMALLINT     NOT NULL DEFAULT 1 CHECK (semester IN (1, 2)),
  academic_year VARCHAR(20)  NOT NULL DEFAULT '2024-2025',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_timetable_user ON timetable_entries(user_id);

-- ─── Reminders ────────────────────────────────────────────────────────────────
CREATE TABLE reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(500)  NOT NULL,
  description   TEXT,
  reminder_type reminder_type NOT NULL DEFAULT 'other',
  scheduled_at  TIMESTAMPTZ   NOT NULL,
  is_completed  BOOLEAN       NOT NULL DEFAULT FALSE,
  course_color  VARCHAR(7),
  scope         VARCHAR(20)   NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'global')),
  status        VARCHAR(20)   NOT NULL DEFAULT 'active'   CHECK (status IN ('active', 'pending', 'approved', 'rejected')),
  submitted_by  UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reminders_user_scheduled ON reminders(user_id, scheduled_at);
CREATE INDEX idx_reminders_scope_status   ON reminders(scope, status);

-- ─── Moderation Log ───────────────────────────────────────────────────────────
CREATE TABLE moderation_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  moderator_id UUID        NOT NULL REFERENCES users(id),
  action       VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject', 'flag')),
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_resources_updated BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Jobs ─────────────────────────────────────────────────────────────────────
CREATE TYPE job_type AS ENUM ('stage', 'cdi', 'cdd', 'freelance', 'other');

CREATE TABLE jobs (
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
CREATE INDEX idx_jobs_active_created ON jobs(is_active, created_at DESC);
CREATE INDEX idx_jobs_domain         ON jobs(domain);
CREATE INDEX idx_jobs_type           ON jobs(job_type);
CREATE INDEX idx_jobs_search ON jobs USING GIN(
  to_tsvector('simple', title || ' ' || company || ' ' || COALESCE(description, ''))
);
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Flashcards ───────────────────────────────────────────────────────────────
CREATE TABLE flashcard_decks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  subject    VARCHAR(200),
  color      VARCHAR(20)  NOT NULL DEFAULT '#8B5CF6',
  card_count INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_flashcard_decks_user ON flashcard_decks(user_id);
CREATE TRIGGER trg_decks_updated BEFORE UPDATE ON flashcard_decks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE flashcards (
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
CREATE INDEX idx_flashcards_deck_review ON flashcards(deck_id, next_review);
