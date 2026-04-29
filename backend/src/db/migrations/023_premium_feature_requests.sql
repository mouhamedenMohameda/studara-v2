-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 023 — Per-Feature Premium Billing (Manual Bank Transfer)
--
-- Flow:
--   1. User sees a feature locked (e.g. Whisper Studio, AI Flashcards…)
--   2. User pays via Mauritanian bank app (Bankily, Masrivi, Sedad…)
--   3. User submits a request WITH a payment screenshot + which bank
--   4. Admin reviews screenshot in admin panel → Approves or Rejects
--   5. On Approve: a row is inserted in user_premium_features (access granted)
--   6. App checks user_premium_features before showing a feature
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Feature catalogue (what can be sold) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS premium_features (
  key          TEXT        PRIMARY KEY,               -- e.g. 'whisper_studio'
  label_ar     TEXT        NOT NULL,                  -- Arabic display name
  label_fr     TEXT        NOT NULL,                  -- French display name
  description_ar TEXT      NOT NULL DEFAULT '',
  description_fr TEXT      NOT NULL DEFAULT '',
  price_mru    INTEGER     NOT NULL DEFAULT 500,       -- Price in Mauritanian Ouguiya
  duration_days INTEGER    NOT NULL DEFAULT 180,       -- How long access lasts after approval
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default features
INSERT INTO premium_features (key, label_ar, label_fr, description_ar, description_fr, price_mru, duration_days, sort_order)
VALUES
  (
    'whisper_studio',
    'استوديو ويسبر',
    'Whisper Studio',
    'تحويل المحاضرات الصوتية إلى نصوص بدقة عالية مع ملخصات وبطاقات تعليمية بالذكاء الاصطناعي',
    'Transcription IA de vos cours audio en texte, résumés et fiches de révision automatiques',
    500,
    180,
    1
  ),
  (
    'ai_flashcards',
    'البطاقات الذكية',
    'Fiches IA',
    'توليد بطاقات تعليمية تلقائية من النصوص والمحاضرات',
    'Génération automatique de fiches de révision depuis vos cours',
    300,
    180,
    2
  ),
  (
    'ai_course',
    'الدرس الذكي',
    'Cours IA',
    'توليد دروس جامعية منظمة من تفريغات المحاضرات',
    'Génération de cours universitaires structurés depuis vos transcriptions',
    300,
    180,
    3
  )
ON CONFLICT (key) DO NOTHING;

-- ── 2. Mauritanian banks list (used in app picker) ────────────────────────────
CREATE TABLE IF NOT EXISTS mauritanian_banks (
  id        SERIAL      PRIMARY KEY,
  name_ar   TEXT        NOT NULL,
  name_fr   TEXT        NOT NULL,
  app_name  TEXT        NOT NULL,   -- Mobile app name for the payment screenshot
  is_active BOOLEAN     NOT NULL DEFAULT true
);

INSERT INTO mauritanian_banks (name_ar, name_fr, app_name) VALUES
  ('بنكيلي',            'Bankily',   'Bankily'),
  ('مصريفي',            'Masrivi',   'Masrivi'),
  ('سداد',              'Sedad',     'Sedad'),
  ('بنك الموريتاني',    'BCI',       'BCI Mobile'),
  ('بنك الخليج',        'GBM',       'GBM Mobile'),
  ('بنك التنمية',       'BMD',       'BMD Mobile'),
  ('البنك الوطني',      'BNM',       'BNM Mobile')
ON CONFLICT DO NOTHING;

-- ── 3. User premium feature requests ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE feature_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS premium_feature_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key     TEXT        NOT NULL REFERENCES premium_features(key) ON DELETE CASCADE,
  bank_name       TEXT        NOT NULL,              -- Free text of selected bank
  screenshot_url  TEXT        NOT NULL,              -- Required — path to saved image
  amount_paid_mru INTEGER,                           -- Optional: amount user claims to have paid
  note            TEXT,                              -- Optional user message
  status          feature_request_status NOT NULL DEFAULT 'pending',
  admin_note      TEXT,                              -- Admin rejection/approval reason
  reviewed_by     UUID        REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pfr_user       ON premium_feature_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_pfr_status     ON premium_feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_pfr_feature    ON premium_feature_requests(feature_key);
CREATE INDEX IF NOT EXISTS idx_pfr_created_at ON premium_feature_requests(created_at DESC);

-- Prevent duplicate PENDING requests for same user+feature
CREATE UNIQUE INDEX IF NOT EXISTS idx_pfr_user_feature_pending
  ON premium_feature_requests(user_id, feature_key)
  WHERE status = 'pending';

CREATE TRIGGER trg_pfr_updated
  BEFORE UPDATE ON premium_feature_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. Granted premium features per user ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_premium_features (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key     TEXT        NOT NULL REFERENCES premium_features(key) ON DELETE CASCADE,
  request_id      UUID        REFERENCES premium_feature_requests(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,              -- granted_at + duration_days
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT upf_user_feature_unique UNIQUE (user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_upf_user       ON user_premium_features(user_id);
CREATE INDEX IF NOT EXISTS idx_upf_feature    ON user_premium_features(feature_key);
CREATE INDEX IF NOT EXISTS idx_upf_expires_at ON user_premium_features(expires_at);
