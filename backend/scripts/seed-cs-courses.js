#!/usr/bin/env node
/**
 * Seed script — CS Video Courses from GitHub
 * Source: https://github.com/Developer-Y/cs-video-courses
 *
 * Run on VPS:
 *   cd /var/www/tawjeeh/api && node scripts/seed-cs-courses.js
 */

require('dotenv').config({ path: '/var/www/tawjeeh/api/.env' });
const { Pool } = require('pg');
const https = require('https');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const README_URL =
  'https://raw.githubusercontent.com/Developer-Y/cs-video-courses/master/README.md';

// ─── Fetch raw README ─────────────────────────────────────────────────────────
function fetchReadme() {
  return new Promise((resolve, reject) => {
    https.get(README_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Category → (subject_fr, subject_ar, year) ────────────────────────────────
const CATEGORY_MAP = {
  'Introduction to Computer Science':          { fr: 'Introduction à l\'Informatique',       ar: 'مقدمة في علوم الحاسوب',          year: 1 },
  'Data Structures and Algorithms':            { fr: 'Structures de Données et Algorithmes', ar: 'هياكل البيانات والخوارزميات',     year: 2 },
  'Operating Systems':                         { fr: 'Systèmes d\'Exploitation',              ar: 'أنظمة التشغيل',                   year: 2 },
  'Distributed Systems':                       { fr: 'Systèmes Distribués',                   ar: 'الأنظمة الموزعة',                  year: 3 },
  'Real-Time Systems':                         { fr: 'Systèmes Temps Réel',                   ar: 'الأنظمة الزمن الحقيقي',            year: 3 },
  'Database Systems':                          { fr: 'Bases de Données',                      ar: 'قواعد البيانات',                   year: 2 },
  'Object Oriented Design':                    { fr: 'Conception Orientée Objet',              ar: 'التصميم كائني التوجه',             year: 2 },
  'Software Engineering':                      { fr: 'Génie Logiciel',                        ar: 'هندسة البرمجيات',                  year: 3 },
  'Software Architecture':                     { fr: 'Architecture Logicielle',                ar: 'معمارية البرمجيات',                year: 3 },
  'Concurrency':                               { fr: 'Programmation Concurrente',              ar: 'البرمجة المتزامنة',                year: 3 },
  'Mobile Application Development':            { fr: 'Développement Mobile',                  ar: 'تطوير تطبيقات الجوال',             year: 3 },
  'Artificial Intelligence':                   { fr: 'Intelligence Artificielle',             ar: 'الذكاء الاصطناعي',                 year: 3 },
  'Introduction to Machine Learning':          { fr: 'Introduction au Machine Learning',      ar: 'مقدمة في تعلم الآلة',              year: 3 },
  'Data Mining':                               { fr: 'Exploration de Données',                ar: 'التنقيب في البيانات',               year: 3 },
  'Probabilistic Graphical Modeling':          { fr: 'Modèles Graphiques Probabilistes',      ar: 'النماذج الاحتمالية البيانية',       year: 4 },
  'Deep Learning':                             { fr: 'Apprentissage Profond',                  ar: 'التعلم العميق',                    year: 4 },
  'Reinforcement Learning':                    { fr: 'Apprentissage par Renforcement',         ar: 'التعلم بالتعزيز',                  year: 4 },
  'Advanced Machine Learning':                 { fr: 'Machine Learning Avancé',               ar: 'تعلم الآلة المتقدم',               year: 4 },
  'Natural Language Processing':               { fr: 'Traitement du Langage Naturel',         ar: 'معالجة اللغة الطبيعية',             year: 4 },
  'Generative AI and LLMs':                    { fr: 'IA Générative et LLMs',                 ar: 'الذكاء الاصطناعي التوليدي',         year: 4 },
  'Computer Vision':                           { fr: 'Vision par Ordinateur',                 ar: 'رؤية الحاسوب',                     year: 4 },
  'Time Series Analysis':                      { fr: 'Analyse de Séries Temporelles',         ar: 'تحليل السلاسل الزمنية',            year: 4 },
  'Optimization':                              { fr: 'Optimisation',                          ar: 'الأمثلة',                          year: 3 },
  'Unsupervised Learning':                     { fr: 'Apprentissage Non Supervisé',            ar: 'التعلم غير المراقب',               year: 4 },
  'Computer Networks':                         { fr: 'Réseaux Informatiques',                 ar: 'الشبكات الحاسوبية',                year: 2 },
  'Math for Computer Scientist':               { fr: 'Mathématiques pour Informaticiens',     ar: 'الرياضيات للمعلوماتيين',           year: 1 },
  'Calculus':                                  { fr: 'Analyse et Calcul',                     ar: 'التفاضل والتكامل',                  year: 1 },
  'Discrete Math':                             { fr: 'Mathématiques Discrètes',               ar: 'الرياضيات المنفصلة',               year: 1 },
  'Probability & Statistics':                  { fr: 'Probabilités et Statistiques',          ar: 'الاحتمالات والإحصاء',              year: 2 },
  'Linear Algebra':                            { fr: 'Algèbre Linéaire',                      ar: 'الجبر الخطي',                     year: 1 },
  'Web Programming and Internet Technologies': { fr: 'Programmation Web',                     ar: 'برمجة الويب',                      year: 2 },
  'Theoretical CS and Programming Languages':  { fr: 'Langages de Programmation',             ar: 'نظرية الحوسبة ولغات البرمجة',      year: 3 },
  'Embedded Systems':                          { fr: 'Systèmes Embarqués',                    ar: 'الأنظمة المدمجة',                  year: 3 },
  'Computer Organization':                     { fr: 'Organisation des Ordinateurs',           ar: 'تنظيم الحاسوب',                    year: 2 },
  'Computer Architecture':                     { fr: 'Architecture des Ordinateurs',           ar: 'معمارية الحاسوب',                  year: 2 },
  'Security':                                  { fr: 'Sécurité Informatique',                 ar: 'أمن المعلومات',                    year: 3 },
  'Computer Graphics':                         { fr: 'Infographie',                           ar: 'رسومات الحاسوب',                   year: 3 },
  'Image Processing and Computer Vision':      { fr: 'Traitement d\'Images',                  ar: 'معالجة الصور',                     year: 4 },
  'Computational Physics':                     { fr: 'Physique Computationnelle',             ar: 'الفيزياء الحسابية',                year: 3 },
  'Computational Biology':                     { fr: 'Biologie Computationnelle',             ar: 'البيولوجيا الحسابية',              year: 3 },
  'Quantum Computing':                         { fr: 'Informatique Quantique',                ar: 'الحوسبة الكمومية',                 year: 4 },
  'Robotics and Control':                      { fr: 'Robotique et Contrôle',                 ar: 'الروبوتيات',                       year: 3 },
  'Computational Finance':                     { fr: 'Finance Computationnelle',              ar: 'المالية الحسابية',                 year: 4 },
  'Network Science':                           { fr: 'Science des Réseaux',                   ar: 'علم الشبكات',                      year: 3 },
  'Blockchain Development':                    { fr: 'Développement Blockchain',              ar: 'تطوير البلوك تشين',                 year: 3 },
  'Misc':                                      { fr: 'Informatique Générale',                 ar: 'علوم الحاسوب المتنوعة',             year: 1 },
  'Misc Machine Learning Topics':              { fr: 'Machine Learning Divers',               ar: 'موضوعات تعلم الآلة',               year: 4 },
  'Systems Programming':                       { fr: 'Programmation Système',                 ar: 'برمجة الأنظمة',                    year: 2 },
  'Machine Learning':                          { fr: 'Machine Learning',                      ar: 'تعلم الآلة',                       year: 3 },
  'Computer Science':                          { fr: 'Informatique',                          ar: 'علوم الحاسوب',                     year: 1 },
};

function getCategoryInfo(cat) {
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (cat.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(cat.toLowerCase())) {
      return val;
    }
  }
  return { fr: cat, ar: cat, year: 2 };
}

// ─── Parse README markdown ────────────────────────────────────────────────────
function parseCourses(md) {
  const courses = [];
  const seen = new Set();
  const lines = md.split('\n');
  let currentSection = 'Computer Science';

  for (const line of lines) {
    // h4 bold sub-sections: `#### **Operating Systems**`
    const h4Bold = line.match(/#{1,4}\s+\*\*(.+?)\*\*\s*$/);
    if (h4Bold) {
      const name = h4Bold[1].trim();
      if (name.length > 2) currentSection = name;
      continue;
    }

    // h3 / h4 plain: `### Section Name`
    const hMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (hMatch) {
      const name = hMatch[1].replace(/\*/g, '').trim();
      const lower = name.toLowerCase();
      if (
        lower !== 'courses' &&
        lower !== 'introduction' &&
        lower !== 'table of contents' &&
        name.length > 2
      ) {
        currentSection = name;
      }
      continue;
    }

    // Course entry: `- [Title ...](url)` (with optional leading spaces)
    const entry = line.match(/^\s*[-*]\s*\[([^\]]{3,490})\]\((https?[^)]+)\)/);
    if (!entry) continue;

    let title = entry[1].trim();
    let url   = entry[2].trim();

    // Prefer YouTube / video playlist link from the rest of the line
    const ytMatch = line.match(
      /\[(?:Video\s*)?(?:Playlist|Lectures?|Videos?|YouTube|Watch)\]\((https?:\/\/[^)\s]+)\)/i
    );
    if (ytMatch) url = ytMatch[1].trim();

    // De-duplicate by title
    const key = title.toLowerCase().slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);

    courses.push({ title: title.slice(0, 490), url, category: currentSection });
  }

  return courses;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔌 Connecting to database…');

  // 1. Add enum value (safe if already exists via try/catch)
  try {
    await pool.query("ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'video_course'");
    console.log("✅ Enum 'video_course' ready");
  } catch (e) {
    // PostgreSQL < 9.3 fallback — just proceed
    console.log('⚠️  Enum already exists or error:', e.message);
  }

  // 2. Get admin user id
  const { rows: admins } = await pool.query(
    "SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1"
  );
  if (!admins.length) {
    console.error('❌ No admin user found in DB. Run seed.sql first.');
    process.exit(1);
  }
  const adminId = admins[0].id;
  console.log('👤 Admin user id:', adminId);

  // 3. Fetch & parse README
  console.log('📥 Fetching README from GitHub…');
  const md = await fetchReadme();
  console.log(`📄 README loaded (${Math.round(md.length / 1024)} KB)`);

  const courses = parseCourses(md);
  console.log(`🎓 Parsed ${courses.length} courses`);

  // 4. Insert courses
  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const course of courses) {
    try {
      // Check duplicate by title
      const dup = await pool.query(
        "SELECT id FROM resources WHERE title = $1 AND resource_type = 'video_course' LIMIT 1",
        [course.title]
      );
      if (dup.rows.length) { skipped++; continue; }

      const info = getCategoryInfo(course.category);

      await pool.query(
        `INSERT INTO resources
          (title, title_ar, description, resource_type, faculty, university, subject, year,
           file_url, file_name, file_type, uploaded_by, status, downloads, likes, tags)
         VALUES ($1,$2,$3,'video_course','sciences','external',$4,$5,$6,$7,'video',$8,'approved',0,0,$9)`,
        [
          course.title,
          null,
          `Cours vidéo — ${info.fr}. Catégorie : ${course.category}.`,
          info.fr,
          info.year,
          course.url,
          course.title,
          adminId,
          [course.category.toLowerCase().replace(/[^a-z0-9]/g, '-'), 'video-course', 'gratuit', 'en-ligne'],
        ]
      );
      inserted++;

      if (inserted % 50 === 0) console.log(`  … ${inserted} inserted`);
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`  ❌ Error on "${course.title}":`, e.message);
    }
  }

  console.log(`\n✅ Done — ${inserted} inserted, ${skipped} skipped (duplicates), ${errors} errors`);
  await pool.end();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
