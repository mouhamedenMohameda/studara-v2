-- ════════════════════════════════════════════════════════════════
--  Migration 001 · Gamification (XP, Badges, Exam Countdown)
-- ════════════════════════════════════════════════════════════════

-- ─── Extend users table ───────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp               INTEGER   NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level            SMALLINT  NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days      INTEGER   NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_date DATE;

-- ─── XP event log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xp_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,   -- 'flashcard_review','upload','login','badge_reward'
  xp_gained   INTEGER     NOT NULL DEFAULT 0,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_events_user ON xp_events(user_id, created_at DESC);

-- ─── Badges catalogue ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS badges (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           VARCHAR(100) UNIQUE NOT NULL,
  name_fr        VARCHAR(255) NOT NULL,
  name_ar        VARCHAR(255) NOT NULL,
  description_fr TEXT,
  description_ar TEXT,
  emoji          VARCHAR(10)  NOT NULL DEFAULT '🏅',
  color          VARCHAR(7)   NOT NULL DEFAULT '#F59E0B',
  condition_type VARCHAR(50)  NOT NULL,  -- 'uploads_count','streak_days','xp_total','cards_reviewed'
  threshold      INTEGER      NOT NULL DEFAULT 1,
  xp_reward      INTEGER      NOT NULL DEFAULT 50,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id   UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  badge_id  UUID NOT NULL REFERENCES badges(id)  ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

-- ─── Exam countdown ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_countdowns (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     VARCHAR(255) NOT NULL,
  exam_date   DATE         NOT NULL,
  color       VARCHAR(7)   NOT NULL DEFAULT '#DC2626',
  notes       TEXT,
  is_done     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_countdowns_user ON exam_countdowns(user_id, exam_date ASC);

-- ─── Seed default badges ──────────────────────────────────────────────────────
INSERT INTO badges (slug, name_fr, name_ar, emoji, color, condition_type, threshold, xp_reward) VALUES
  ('first_upload',    'Premier partage',       'أول مشاركة',        '📤', '#8B5CF6', 'uploads_count',   1,   50),
  ('prolific_5',      'Contributeur actif',    'مساهم نشط',         '📚', '#6366F1', 'uploads_count',   5,  100),
  ('prolific_10',     'Prolifique',             'غزير الإنتاج',      '🎓', '#4F46E5', 'uploads_count',  10,  200),
  ('streak_3',        '3 jours de suite',      '٣ أيام متتالية',    '🔥', '#F97316', 'streak_days',     3,   75),
  ('streak_7',        'Semaine complète',       'أسبوع كامل',        '🔥', '#EF4444', 'streak_days',     7,  150),
  ('streak_30',       'Mois de feu',            'شهر نشاط',          '🌋', '#B91C1C', 'streak_days',    30,  500),
  ('xp_100',          'Premier palier XP',      'أول ١٠٠ XP',        '⭐', '#F59E0B', 'xp_total',      100,    0),
  ('xp_500',          'Étudiant assidu',         'طالب مجتهد',        '🌟', '#EAB308', 'xp_total',      500,    0),
  ('xp_1000',         'Expert Tawjeeh',          'خبير توجيه',        '💎', '#06B6D4', 'xp_total',     1000,    0),
  ('cards_50',        'Réviseur régulier',       'مراجع منتظم',       '🃏', '#0EA5E9', 'cards_reviewed',  50,  100),
  ('cards_100',       'Maître des flashcards',   'سيد البطاقات',      '🎴', '#0284C7', 'cards_reviewed', 100,  200)
ON CONFLICT (slug) DO NOTHING;
