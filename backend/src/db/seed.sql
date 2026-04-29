-- Seed file — run AFTER schema.sql
-- Usage: psql $DATABASE_URL -f src/db/seed.sql

-- Admin user (password: Admin@2025!)
INSERT INTO users (email, password_hash, full_name, full_name_ar, university, faculty, year, role, is_verified)
VALUES (
  'admin@tawjeeh.mr',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMeBMFhWVgZy1lgqU4Fz3BXrGe', -- Admin@2025!
  'Tawjeeh Admin',
  'مدير توجيه',
  'una',
  'sciences',
  1,
  'admin',
  TRUE
);

-- Demo student
INSERT INTO users (email, password_hash, full_name, full_name_ar, university, faculty, year, role, is_verified, total_uploads, total_downloads)
VALUES (
  'demo@univ-nktt.mr',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMeBMFhWVgZy1lgqU4Fz3BXrGe', -- Admin@2025!
  'Mohamed Ould Ahmed',
  'محمد ولد أحمد',
  'una',
  'sciences',
  2,
  'student',
  TRUE,
  3,
  18
);

-- Sample approved resources
INSERT INTO resources (title, title_ar, description, resource_type, faculty, university, subject, year, uploaded_by, status, downloads, likes, tags)
SELECT
  'Analyse Mathématique S1',
  'التحليل الرياضي - الفصل الأول',
  'ملخص شامل لمحاضرات التحليل الرياضي للفصل الأول، يشمل الحدود والاشتقاق والتكامل.',
  'summary',
  'sciences',
  'una',
  'Analyse Mathématique',
  1,
  id,
  'approved',
  128,
  34,
  ARRAY['maths', 'analyse', 'sciences']
FROM users WHERE email = 'demo@univ-nktt.mr';

INSERT INTO resources (title, title_ar, description, resource_type, faculty, university, subject, year, uploaded_by, status, downloads, likes, tags)
SELECT
  'Anatomie Générale — Fascicule 1',
  'علم التشريح العام - الجزء الأول',
  'ملاحظات تفصيلية لمادة التشريح، تشمل رسومات توضيحية لأجهزة الجسم الرئيسية.',
  'note',
  'medicine',
  'una',
  'Anatomie',
  2,
  id,
  'approved',
  89,
  22,
  ARRAY['anatomie', 'médecine', 'corps_humain']
FROM users WHERE email = 'demo@univ-nktt.mr';

INSERT INTO resources (title, title_ar, description, resource_type, faculty, university, subject, year, uploaded_by, status, downloads, likes, tags)
SELECT
  'Droit Commercial — Examen 2023',
  'امتحان القانون التجاري 2023',
  'امتحان نهاية السنة في مادة القانون التجاري مع نموذج الإجابة المقترحة.',
  'past_exam',
  'law',
  'una',
  'Droit Commercial',
  3,
  id,
  'approved',
  203,
  67,
  ARRAY['droit', 'commerce', 'examen']
FROM users WHERE email = 'demo@univ-nktt.mr';

INSERT INTO resources (title, title_ar, description, resource_type, faculty, university, subject, year, uploaded_by, status, downloads, likes, tags)
SELECT
  'Exercices Thermodynamique',
  'تمارين الديناميكا الحرارية',
  'سلسلة تمارين محلولة في مادة الثيرموديناميك مع شرح تفصيلي للحلول.',
  'exercise',
  'sciences',
  'upm',
  'Physique',
  2,
  id,
  'approved',
  55,
  18,
  ARRAY['physique', 'thermodynamique', 'exercices']
FROM users WHERE email = 'demo@univ-nktt.mr';

-- Pending resource (for admin moderation demo)
INSERT INTO resources (title, title_ar, resource_type, faculty, university, subject, year, uploaded_by, status, tags)
SELECT
  'Macroéconomie — Résumé S2',
  'ملخص الاقتصاد الكلي - الفصل الثاني',
  'summary',
  'economics',
  'una',
  'Macroéconomie',
  1,
  id,
  'pending',
  ARRAY['économie', 'macro']
FROM users WHERE email = 'demo@univ-nktt.mr';
