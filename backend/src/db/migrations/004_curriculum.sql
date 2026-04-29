-- ─── Migration 004: Curriculum (Filières + Matières) ─────────────────────────
-- Crée les tables faculties et subjects pour la gestion du curriculum
-- depuis le panel admin.

-- ── Filières ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faculties (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(50)  UNIQUE NOT NULL,
  name_fr     VARCHAR(100) NOT NULL,
  name_ar     VARCHAR(100) NOT NULL,
  icon        VARCHAR(10)  NOT NULL DEFAULT '🎓',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Pré-peupler avec les 7 filières existantes dans l'app mobile (slugs = enum Faculty)
INSERT INTO faculties (slug, name_fr, name_ar, icon, sort_order) VALUES
  ('sciences',    'Sciences',             'العلوم',                '🔬', 1),
  ('medicine',    'Médecine',             'الطب',                  '🏥', 2),
  ('law',         'Droit',                'الحقوق',                '⚖️', 3),
  ('economics',   'Économie',             'الاقتصاد',              '📊', 4),
  ('arts',        'Lettres & Arts',       'الآداب والفنون',        '📚', 5),
  ('engineering', 'Ingénierie',           'الهندسة',               '⚙️', 6),
  ('islamic',     'Études Islamiques',    'الدراسات الإسلامية',    '🕌', 7)
ON CONFLICT (slug) DO NOTHING;

-- ── Matières ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar      VARCHAR(200) NOT NULL,
  name_fr      VARCHAR(200),
  faculty_slug VARCHAR(50)  NOT NULL REFERENCES faculties(slug) ON DELETE CASCADE,
  year         SMALLINT,      -- NULL = applicable à toutes les années
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (name_ar, faculty_slug, year)
);

CREATE INDEX IF NOT EXISTS idx_subjects_faculty ON subjects(faculty_slug, is_active);
CREATE INDEX IF NOT EXISTS idx_subjects_year    ON subjects(year)        WHERE year IS NOT NULL;
