-- Migration 020: Academic Structure (Universities → Faculties → Filieres)
-- Dynamic replacement for the hardcoded academicStructure.ts constant

CREATE TABLE IF NOT EXISTS academic_universities (
  id         SERIAL PRIMARY KEY,
  slug       VARCHAR(50)  UNIQUE NOT NULL,
  name_ar    VARCHAR(200) NOT NULL,
  name_fr    VARCHAR(200) NOT NULL,
  city       VARCHAR(100),
  sort_order INT          DEFAULT 0,
  is_active  BOOLEAN      DEFAULT true,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_faculties (
  id              SERIAL PRIMARY KEY,
  slug            VARCHAR(50)  UNIQUE NOT NULL,
  university_slug VARCHAR(50)  NOT NULL REFERENCES academic_universities(slug) ON DELETE CASCADE,
  name_ar         VARCHAR(200) NOT NULL,
  name_fr         VARCHAR(200) NOT NULL,
  type            VARCHAR(30)  NOT NULL DEFAULT 'faculty'
                    CHECK (type IN ('faculty','institute','preparatory','prepa-engineer')),
  diploma_note    TEXT,
  sort_order      INT          DEFAULT 0,
  is_active       BOOLEAN      DEFAULT true,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_filieres (
  id           SERIAL PRIMARY KEY,
  slug         VARCHAR(50)  UNIQUE NOT NULL,
  faculty_slug VARCHAR(50)  NOT NULL REFERENCES academic_faculties(slug) ON DELETE CASCADE,
  name_ar      VARCHAR(200) NOT NULL,
  name_fr      VARCHAR(200) NOT NULL,
  sort_order   INT          DEFAULT 0,
  is_active    BOOLEAN      DEFAULT true,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── Seed: Universities ───────────────────────────────────────────────────────
INSERT INTO academic_universities (slug, name_ar, name_fr, city, sort_order) VALUES
  ('una',           'جامعة نواكشوط العصرية',                               'Université de Nouakchott Al-Asriya',                              'نواكشوط', 1),
  ('polytechnique', 'المركب البوليتقني',                                    'Complexe Polytechnique',                                          'نواكشوط', 2),
  ('ise',           'المعهد العالي للتعليم التكنولوجي — روصو',              'Institut Supérieur d''Enseignement Technologique (Rosso)',         'روصو',    3),
  ('iseri',         'المعهد العالي للدراسات الإسلامية',                     'Institut Supérieur d''Enseignement des Ressources Islamiques',    'نواكشوط', 4)
ON CONFLICT (slug) DO NOTHING;

-- ─── Seed: Faculties / Instituts ─────────────────────────────────────────────
INSERT INTO academic_faculties (slug, university_slug, name_ar, name_fr, type, diploma_note, sort_order) VALUES
  -- UNA
  ('una-fst',  'una', 'كلية العلوم والتقنيات',            'Faculté des Sciences et Techniques',                    'faculty', NULL, 1),
  ('una-flsh', 'una', 'كلية الآداب والعلوم الإنسانية',    'Faculté des Lettres et Sciences Humaines',              'faculty', NULL, 2),
  ('una-fsje', 'una', 'كلية الحقوق والعلوم الاقتصادية',   'Faculté des Sciences Juridiques et Économiques',        'faculty', NULL, 3),
  ('una-fsi',  'una', 'كلية العلوم الإسلامية',             'Faculté des Sciences Islamiques',                       'faculty', NULL, 4),
  ('una-fm',   'una', 'كلية الطب',                         'Faculté de Médecine',                                   'faculty', NULL, 5),
  -- Complexe Polytechnique
  ('poly-ipgei',       'polytechnique', 'المعهد التحضيري للدراسات الهندسية والصناعية (IPGEI)', 'Institut Préparatoire aux Grandes Écoles d''Ingénieurs (IPGEI)', 'prepa-engineer', 'Diplôme d''ingénieur d''État (5 ans) — 2 ans prépa + 3 ans spécialité au sein du Complexe', 1),
  ('poly-numerique',   'polytechnique', 'معهد الرقمنة والتكنولوجيا',             'Institut du Numérique',          'institute', 'Licence / Master LMD', 2),
  ('poly-aleg',        'polytechnique', 'معهد ألاك',                              'Institut d''Aleg',               'institute', 'Licence / Master LMD', 3),
  ('poly-zouerat',     'polytechnique', 'معهد زويرات',                            'Institut de Zouérat',            'institute', 'Licence / Master LMD', 4),
  ('poly-energie',     'polytechnique', 'معهد الطاقة',                            'Institut d''Énergie',            'institute', 'Licence / Master LMD', 5),
  ('poly-statistique', 'polytechnique', 'معهد الإحصاء وتحليل البيانات',           'Institut de Statistique',        'institute', 'Licence / Master LMD', 6),
  -- ISET Rosso
  ('iset-genie', 'ise', 'معهد الهندسة والتقنيات',                 'Institut Génie et Technologies',                              'institute', NULL, 1),
  ('iset-agro',  'ise', 'معهد العلوم الزراعية والبيئة',           'Institut des Sciences Agronomiques et de l''Environnement',   'institute', NULL, 2),
  -- ISERI
  ('iseri-quran', 'iseri', 'معهد القرآن الكريم وعلومه',  'Institut du Coran et de ses Sciences', 'institute', NULL, 1),
  ('iseri-fiqh',  'iseri', 'معهد الفقه والأصول',         'Institut du Fiqh et des Ousoul',       'institute', NULL, 2)
ON CONFLICT (slug) DO NOTHING;

-- ─── Seed: Filieres ──────────────────────────────────────────────────────────
INSERT INTO academic_filieres (slug, faculty_slug, name_ar, name_fr, sort_order) VALUES
  -- UNA FST
  ('fst-math',     'una-fst', 'الرياضيات',           'Mathématiques',                    1),
  ('fst-info',     'una-fst', 'الإعلامية',            'Informatique',                     2),
  ('fst-physique', 'una-fst', 'الفيزياء',             'Physique',                         3),
  ('fst-chimie',   'una-fst', 'الكيمياء',             'Chimie',                           4),
  ('fst-svt',      'una-fst', 'علوم الحياة والأرض',   'Sciences de la Vie et de la Terre', 5),
  ('fst-geo-sci',  'una-fst', 'الجيولوجيا',           'Géologie',                         6),
  -- UNA FLSH
  ('flsh-arabe',    'una-flsh', 'اللغة العربية وآدابها', 'Langue et Littérature Arabes', 1),
  ('flsh-francais', 'una-flsh', 'اللغة الفرنسية',        'Langue Française',             2),
  ('flsh-anglais',  'una-flsh', 'اللغة الإنجليزية',      'Langue Anglaise',              3),
  ('flsh-histoire', 'una-flsh', 'التاريخ',               'Histoire',                     4),
  ('flsh-geo',      'una-flsh', 'الجغرافيا',             'Géographie',                   5),
  ('flsh-philo',    'una-flsh', 'الفلسفة',               'Philosophie',                  6),
  ('flsh-socio',    'una-flsh', 'علم الاجتماع',          'Sociologie',                   7),
  ('flsh-psycho',   'una-flsh', 'علم النفس',             'Psychologie',                  8),
  -- UNA FSJE
  ('fsje-droit-prive',  'una-fsje', 'الحقوق الخاصة',  'Droit Privé',  1),
  ('fsje-droit-public', 'una-fsje', 'الحقوق العامة',  'Droit Public', 2),
  ('fsje-eco',          'una-fsje', 'الاقتصاد',        'Économie',     3),
  ('fsje-gestion',      'una-fsje', 'التسيير',         'Gestion',      4),
  ('fsje-finance',      'una-fsje', 'المالية',         'Finance',      5),
  -- UNA FSI
  ('fsi-sharia',  'una-fsi', 'الشريعة الإسلامية', 'Charia Islamique',        1),
  ('fsi-ousoul',  'una-fsi', 'أصول الدين',         'Ousoul al-Din',           2),
  ('fsi-dawah',   'una-fsi', 'الدعوة والإعلام',    'Dawa et Communication',   3),
  -- UNA FM
  ('fm-generale',  'una-fm', 'الطب العام',   'Médecine Générale',   1),
  ('fm-pharmacie', 'una-fm', 'الصيدلة',      'Pharmacie',           2),
  ('fm-dentaire',  'una-fm', 'طب الأسنان',   'Chirurgie Dentaire',  3),
  -- IPGEI
  ('ipgei-prepa-mp',    'poly-ipgei', 'الرياضيات والفيزياء (MP) — تحضيري',       'Prépa MP (Maths-Physique)',          1),
  ('ipgei-prepa-pt',    'poly-ipgei', 'الفيزياء والتقنية (PT) — تحضيري',          'Prépa PT (Physique-Technologie)',    2),
  ('ipgei-prepa-bcpst', 'poly-ipgei', 'أحياء وكيمياء وفيزياء (BCPST) — تحضيري',  'Prépa BCPST',                       3),
  ('ipgei-gc',          'poly-ipgei', 'الهندسة المدنية (سنوات ٣-٤-٥)',             'Génie Civil (3e→5e an.)',            4),
  ('ipgei-ee',          'poly-ipgei', 'الهندسة الكهربائية (سنوات ٣-٤-٥)',          'Génie Électrique (3e→5e an.)',       5),
  ('ipgei-info',        'poly-ipgei', 'هندسة المعلوماتية (سنوات ٣-٤-٥)',           'Génie Informatique (3e→5e an.)',     6),
  ('ipgei-mines',       'poly-ipgei', 'هندسة التعدين والمعادن (سنوات ٣-٤-٥)',      'Génie Minier (3e→5e an.)',           7),
  ('ipgei-meca',        'poly-ipgei', 'الهندسة الميكانيكية (سنوات ٣-٤-٥)',         'Génie Mécanique (3e→5e an.)',        8),
  ('ipgei-indus',       'poly-ipgei', 'الهندسة الصناعية (سنوات ٣-٤-٥)',            'Génie Industriel (3e→5e an.)',       9),
  -- Institut du Numérique
  ('num-info',        'poly-numerique', 'الإعلامية والبرمجة',        'Informatique et Programmation',              1),
  ('num-reseaux',     'poly-numerique', 'الشبكات والاتصالات',         'Réseaux et Télécommunications',              2),
  ('num-cyber',       'poly-numerique', 'الأمن المعلوماتي',           'Cybersécurité',                              3),
  ('num-ia',          'poly-numerique', 'الذكاء الاصطناعي والبيانات', 'Intelligence Artificielle et Data',          4),
  ('num-dev-logiciel','poly-numerique', 'هندسة البرمجيات',            'Génie Logiciel',                             5),
  -- Institut d'Aleg
  ('aleg-agro',    'poly-aleg', 'الهندسة الزراعية',          'Agronomie',                              1),
  ('aleg-elevage', 'poly-aleg', 'الثروة الحيوانية',           'Élevage et Productions Animales',        2),
  ('aleg-env',     'poly-aleg', 'البيئة والتنمية المستدامة',  'Environnement et Développement Durable', 3),
  ('aleg-hydraul', 'poly-aleg', 'الهيدروليك والموارد المائية','Hydraulique et Ressources en Eau',       4),
  -- Institut de Zouérat
  ('zouerat-mines', 'poly-zouerat', 'هندسة التعدين والمناجم',    'Génie Minier et Exploitation', 1),
  ('zouerat-geo',   'poly-zouerat', 'الجيولوجيا التطبيقية',       'Géologie Appliquée',           2),
  ('zouerat-maint', 'poly-zouerat', 'صيانة المعدات الثقيلة',      'Maintenance des Équipements Lourds', 3),
  ('zouerat-meca',  'poly-zouerat', 'الميكانيك الصناعي',          'Mécanique Industrielle',       4),
  -- Institut d'Énergie
  ('ener-renouv',     'poly-energie', 'الطاقات المتجددة',            'Énergies Renouvelables',                       1),
  ('ener-electr',     'poly-energie', 'الهندسة الكهربائية والطاقة',  'Électrotechnique et Énergie',                  2),
  ('ener-petrole',    'poly-energie', 'هندسة النفط والغاز',           'Génie Pétrolier et Gazier',                    3),
  ('ener-efficacite', 'poly-energie', 'كفاءة الطاقة والبناء المستدام','Efficacité Énergétique et Bâtiment Durable',   4),
  -- Institut de Statistique
  ('stat-stats',     'poly-statistique', 'الإحصاء والاحتمالات',        'Statistiques et Probabilités',        1),
  ('stat-demo',      'poly-statistique', 'الديموغرافيا',               'Démographie',                         2),
  ('stat-data',      'poly-statistique', 'تحليل البيانات والنمذجة',    'Analyse des Données et Modélisation', 3),
  ('stat-actuariat', 'poly-statistique', 'الاكتواريات والتأمين',        'Actuariat et Assurance',              4),
  -- ISET Genie
  ('iset-maintenance', 'iset-genie', 'الصيانة الصناعية',   'Maintenance Industrielle',   1),
  ('iset-telecoms',    'iset-genie', 'الاتصالات',           'Télécommunications',          2),
  ('iset-energie',     'iset-genie', 'هندسة الطاقة',        'Génie Énergie',              3),
  ('iset-info-iset',   'iset-genie', 'الإعلامية التطبيقية', 'Informatique Appliquée',     4),
  -- ISET Agro
  ('iset-agro-fil', 'iset-agro', 'الهندسة الزراعية', 'Agronomie',                    1),
  ('iset-env',      'iset-agro', 'البيئة والتنمية',   'Environnement et Développement', 2),
  -- ISERI Quran
  ('iseri-quran-fil', 'iseri-quran', 'القرآن الكريم والتفسير', 'Coran et Exégèse',               1),
  ('iseri-tajwid',    'iseri-quran', 'التجويد والقراءات',      'Tajwid et Lectures Coraniques',  2),
  -- ISERI Fiqh
  ('iseri-usul-fiqh', 'iseri-fiqh', 'أصول الفقه',    'Ousoul al-Fiqh',       1),
  ('iseri-hadith',    'iseri-fiqh', 'علوم الحديث',   'Sciences du Hadith',   2),
  ('iseri-aqida',     'iseri-fiqh', 'العقيدة',        'Aqida',                3)
ON CONFLICT (slug) DO NOTHING;
