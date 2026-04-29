#!/usr/bin/env python3
"""
Bulk seed: Filières + Matières de l'enseignement supérieur mauritanien
Cible: DB locale postgresql://tawjeeh:...@localhost:5432/tawjeeh
"""
import subprocess, json, sys

DB = "postgresql://tawjeeh:db48fb0ef5014ce5b53fb196dc4c0c20@localhost:5432/tawjeeh"

def psql(sql):
    r = subprocess.run(["psql", DB, "-c", sql], capture_output=True, text=True)
    if r.returncode != 0 and "already exists" not in r.stderr and "duplicate" not in r.stderr.lower():
        print("ERR:", r.stderr[:200])
    return r.returncode == 0

def psql_many(statements):
    combined = "\n".join(statements)
    r = subprocess.run(["psql", DB], input=combined, capture_output=True, text=True)
    if r.returncode != 0:
        print("ERR:", r.stderr[:400])
    return r.stdout

# ─── 1. FACULTIES ────────────────────────────────────────────────────────────
FACULTIES = [
    # slug, name_fr, name_ar, icon, sort_order
    ("sciences",    "Sciences & Techniques (FST)",         "العلوم والتقنيات",           "🔬", 1),
    ("medicine",    "Médecine, Pharmacie & Odonto",        "الطب والصيدلة",              "🏥", 2),
    ("law",         "Sciences Juridiques & Politiques",    "العلوم القانونية والسياسية", "⚖️", 3),
    ("economics",   "Économie & Gestion",                  "الاقتصاد والتسيير",          "📊", 4),
    ("arts",        "Lettres & Sciences Humaines (FLSH)",  "الآداب والعلوم الإنسانية",   "📚", 5),
    ("engineering", "École Supérieure Polytechnique (ESP)","المدرسة العليا متعددة التقنيات","⚙️",6),
    ("islamic",     "Études Islamiques (ISERI)",           "الدراسات الإسلامية",         "🕌", 7),
    ("iup",         "Institut Universitaire Professionnel","المعهد الجامعي المهني",       "🏭", 8),
    ("ens",         "École Normale Supérieure (ENS)",      "المدرسة العليا للتعليم",      "🎓", 9),
    ("is2m",        "Institut des Métiers de la Mine (Zouerate)", "معهد مهن المناجم",   "⛏️", 10),
    ("istp",        "Institut des Travaux Publics (Aleg)", "معهد الأشغال العمومية",       "🏗️", 11),
    ("iset",        "Institut Sup. d'Enseignement Technologique (Rosso)", "المعهد العالي للتعليم التكنولوجي", "🌱", 12),
    ("iscae",       "Institut Sup. de Comptabilité & Admin. (ISCAE)", "المعهد العالي للمحاسبة والإدارة", "💼", 13),
    ("isem",        "Institut Sup. des Études Maritimes (Nouadhibou)", "المعهد العالي للدراسات البحرية", "⚓", 14),
]

# ─── 2. SUBJECTS ─────────────────────────────────────────────────────────────
# (name_ar, name_fr, faculty_slug, year_or_None)
SUBJECTS = [
    # ── Transversal (commun à tous) ──────────────────────────────────────────
    ("الفرنسية",                    "Français",                      "sciences",   None),
    ("الإنجليزية",                  "Anglais",                       "sciences",   None),
    ("الإعلاميات",                  "Informatique Bureautique",      "sciences",   None),
    ("مقاولاتية",                   "Entrepreneuriat",               "sciences",   None),
    ("أخلاقيات",                    "Éthique",                       "sciences",   None),

    # ── FST — Tronc commun (S1-S2) ──────────────────────────────────────────
    ("التحليل الرياضي",             "Analyse Mathématique",          "sciences",   1),
    ("الجبر الخطي",                 "Algèbre Linéaire",              "sciences",   1),
    ("فيزياء عامة",                 "Physique Générale",             "sciences",   1),
    ("كيمياء عامة",                 "Chimie Générale",               "sciences",   1),
    ("الرياضيات للمعلوماتية",       "Mathématiques pour l'Info",     "sciences",   1),
    ("منطق ومجموعات",               "Logique et Ensembles",          "sciences",   1),

    # ── FST — Informatique (S3-S6) ───────────────────────────────────────────
    ("خوارزميات",                   "Algorithmique",                 "sciences",   2),
    ("هياكل البيانات",              "Structures de Données",         "sciences",   2),
    ("أنظمة الاستغلال",             "Systèmes d'Exploitation",       "sciences",   2),
    ("قواعد البيانات",              "Bases de Données",              "sciences",   3),
    ("تطوير الويب",                 "Développement Web",             "sciences",   3),
    ("شبكات المعلوماتية",           "Réseaux Informatiques",         "sciences",   3),
    ("هندسة البرمجيات",             "Génie Logiciel",                "sciences",   3),
    ("ذكاء اصطناعي",                "Intelligence Artificielle",     "sciences",   4),
    ("أمن المعلومات",               "Sécurité Informatique",         "sciences",   4),
    ("تطوير تطبيقات الجوال",        "Développement Mobile",          "sciences",   4),
    ("خوارزميات متقدمة",            "Algorithmique Avancée",         "sciences",   4),
    ("بحث عمليات",                  "Recherche Opérationnelle",      "sciences",   4),

    # ── FST — Mathématiques Appliquées ───────────────────────────────────────
    ("تحليل عددي",                  "Analyse Numérique",             "sciences",   3),
    ("احتمالات وإحصاء",             "Probabilités et Statistiques",  "sciences",   2),
    ("معادلات تفاضلية",             "Équations Différentielles",     "sciences",   3),
    ("تحسين",                       "Optimisation",                  "sciences",   4),

    # ── FST — Physique Appliquée ─────────────────────────────────────────────
    ("كهرباء صناعية",               "Électricité Industrielle",      "sciences",   3),
    ("حساسات وقياسات",              "Capteurs et Mesures",           "sciences",   3),
    ("ديناميكا حرارية",             "Thermodynamique",               "sciences",   2),
    ("ميكانيكا",                    "Mécanique",                     "sciences",   2),
    ("بصريات",                      "Optique",                       "sciences",   3),
    ("فيزياء حالة صلبة",            "Physique de l'État Solide",     "sciences",   4),

    # ── FST — Chimie ─────────────────────────────────────────────────────────
    ("كيمياء عضوية",                "Chimie Organique",              "sciences",   2),
    ("كيمياء غير عضوية",            "Chimie Inorganique",            "sciences",   2),
    ("كيمياء المواد",               "Chimie des Matériaux",          "sciences",   3),
    ("كيمياء تحليلية",              "Chimie Analytique",             "sciences",   3),

    # ── FST — Biologie ───────────────────────────────────────────────────────
    ("أحياء خلوية",                 "Biologie Cellulaire",           "sciences",   1),
    ("جراثيم",                      "Microbiologie",                 "sciences",   2),
    ("بيئة",                        "Écologie",                      "sciences",   3),
    ("وراثة",                       "Génétique",                     "sciences",   3),
    ("كيمياء حيوية",                "Biochimie",                     "sciences",   2),
    ("تقنية حيوية",                 "Biotechnologie",                "sciences",   4),

    # ── FST — Géologie ───────────────────────────────────────────────────────
    ("جيومورفولوجيا",               "Géomorphologie",                "sciences",   3),
    ("بترولوجيا",                   "Pétrologie",                    "sciences",   3),
    ("معدنية",                      "Minéralogie",                   "sciences",   2),
    ("جيوفيزياء",                   "Géophysique",                   "sciences",   4),

    # ── Médecine ─────────────────────────────────────────────────────────────
    ("تشريح",                       "Anatomie",                      "medicine",   1),
    ("فيزيولوجيا",                  "Physiologie",                   "medicine",   1),
    ("كيمياء حيوية طبية",           "Biochimie Médicale",            "medicine",   1),
    ("علم الأنسجة",                 "Histologie",                    "medicine",   1),
    ("جراثيم طبية",                 "Microbiologie Médicale",        "medicine",   2),
    ("صيدلة",                       "Pharmacologie",                 "medicine",   3),
    ("سيميولوجيا",                  "Sémiologie",                    "medicine",   3),
    ("طب عام",                      "Médecine Générale",             "medicine",   4),
    ("صحة عمومية",                  "Santé Publique",                "medicine",   4),
    ("أمراض النساء والولادة",        "Gynécologie-Obstétrique",       "medicine",   5),
    ("طب الأطفال",                  "Pédiatrie",                     "medicine",   5),
    ("جراحة",                       "Chirurgie",                     "medicine",   5),
    ("طب الأسنان",                  "Odontostomatologie",            "medicine",   4),
    ("وبائيات",                     "Épidémiologie",                 "medicine",   4),

    # ── Sciences Juridiques & Politiques ─────────────────────────────────────
    ("مدخل للقانون",                "Introduction au Droit",         "law",        1),
    ("قانون مدني",                  "Droit Civil",                   "law",        1),
    ("قانون جنائي",                 "Droit Pénal",                   "law",        2),
    ("قانون عام",                   "Droit Public",                  "law",        2),
    ("قانون خاص",                   "Droit Privé",                   "law",        2),
    ("قانون تجاري",                 "Droit Commercial",              "law",        3),
    ("قانون بحري",                  "Droit Maritime",                "law",        3),
    ("حقوق الإنسان",                "Droits de l'Homme",             "law",        3),
    ("قانون دستوري",                "Droit Constitutionnel",         "law",        2),
    ("قانون دولي",                  "Droit International",           "law",        3),
    ("علوم سياسية",                 "Sciences Politiques",           "law",        2),
    ("قانون إداري",                 "Droit Administratif",           "law",        3),
    ("إجراءات مدنية",               "Procédures Civiles",            "law",        3),

    # ── Économie & Gestion ───────────────────────────────────────────────────
    ("مبادئ الاقتصاد",              "Économie Générale",             "economics",  1),
    ("اقتصاد جزئي",                 "Microéconomie",                 "economics",  1),
    ("اقتصاد كلي",                  "Macroéconomie",                 "economics",  2),
    ("محاسبة عامة",                 "Comptabilité Générale",         "economics",  1),
    ("مالية عامة",                  "Finance",                       "economics",  3),
    ("بنوك",                        "Banque",                        "economics",  3),
    ("موارد بشرية",                 "Ressources Humaines",           "economics",  3),
    ("تسويق",                       "Marketing",                     "economics",  3),
    ("تسيير",                       "Management",                    "economics",  2),
    ("إحصاء اقتصادي",               "Statistiques Économiques",      "economics",  2),
    ("محاسبة تحليلية",              "Comptabilité Analytique",       "economics",  3),
    ("تدقيق",                       "Audit",                         "economics",  4),
    ("رياضيات مالية",               "Mathématiques Financières",     "economics",  2),

    # ── Lettres & Sciences Humaines (FLSH) ───────────────────────────────────
    ("أدب عربي",                    "Littérature Arabe",             "arts",       1),
    ("تاريخ",                       "Histoire",                      "arts",       1),
    ("جغرافيا",                     "Géographie",                    "arts",       1),
    ("علم الاجتماع",                "Sociologie",                    "arts",       2),
    ("أثريات",                      "Archéologie",                   "arts",       3),
    ("لسانيات",                     "Linguistique",                  "arts",       2),
    ("فرنسية",                      "Langue Française",              "arts",       1),
    ("إنجليزية",                    "Langue Anglaise",               "arts",       1),
    ("فلسفة",                       "Philosophie",                   "arts",       2),
    ("نحو وصرف",                    "Grammaire Arabe",               "arts",       1),
    ("علم النفس",                   "Psychologie",                   "arts",       2),

    # ── ESP — École Supérieure Polytechnique ─────────────────────────────────
    ("هندسة مدنية",                 "Génie Civil",                   "engineering",2),
    ("هندسة كهربائية",              "Génie Électrique",              "engineering",2),
    ("هندسة ميكانيكية",             "Génie Mécanique",               "engineering",2),
    ("معلوماتية وشبكات",            "Informatique & Réseaux",        "engineering",2),
    ("مناجم وبترول",                "Mines & Pétrole",               "engineering",3),
    ("رياضيات للمهندس",             "Mathématiques pour Ingénieur",  "engineering",1),
    ("ميكانيكا الموائع",            "Mécanique des Fluides",         "engineering",2),
    ("مقاومة المواد",               "Résistance des Matériaux",      "engineering",2),
    ("رسم هندسي",                   "Dessin Technique",              "engineering",1),
    ("هندسة طاقوية",                "Génie Énergétique",             "engineering",3),
    ("طاقات متجددة",                "Énergies Renouvelables",        "engineering",3),
    ("أمن صناعي",                   "Sécurité Industrielle",         "engineering",3),
    ("إدارة مشاريع",                "Gestion de Projets",            "engineering",4),

    # ── ISERI — Études Islamiques ─────────────────────────────────────────────
    ("فقه",                         "Fiqh (Jurisprudence islamique)", "islamic",    1),
    ("حديث",                        "Hadith",                        "islamic",    1),
    ("تفسير",                       "Tafsir (Exégèse)",              "islamic",    1),
    ("عقيدة",                       "Théologie (Aqida)",             "islamic",    1),
    ("لغة عربية",                   "Langue Arabe",                  "islamic",    1),
    ("اقتصاد إسلامي",               "Économie Islamique",            "islamic",    2),
    ("قانون مقارن",                 "Droit Comparé",                 "islamic",    3),
    ("حضارة إسلامية",               "Civilisation Islamique",        "islamic",    2),
    ("أصول الفقه",                  "Ousoul Eddine",                 "islamic",    2),
    ("سيرة نبوية",                  "Sira Nabawiya",                 "islamic",    1),

    # ── IUP — Institut Universitaire Professionnel ────────────────────────────
    ("هندسة صناعية",                "Génie Industriel",              "iup",        None),
    ("اتصالات",                     "Télécommunications",            "iup",        None),
    ("مقاولاتية",                   "Entrepreneuriat",               "iup",        None),
    ("شبكات معلوماتية",             "Réseaux Informatiques",         "iup",        None),

    # ── ENS — École Normale Supérieure ───────────────────────────────────────
    ("رياضيات (تعليم)",             "Mathématiques (Enseignement)",  "ens",        None),
    ("فيزياء-كيمياء (تعليم)",       "Physique-Chimie (Enseign.)",    "ens",        None),
    ("علوم الحياة والأرض (تعليم)",  "SVT (Enseignement)",            "ens",        None),
    ("آداب عربية (تعليم)",          "Lettres Arabes (Enseignement)", "ens",        None),
    ("آداب فرنسية (تعليم)",         "Lettres Françaises (Enseign.)", "ens",        None),
    ("إنجليزية (تعليم)",            "Anglais (Enseignement)",        "ens",        None),
    ("تاريخ-جغرافيا (تعليم)",       "Histoire-Géographie (Enseign.)","ens",        None),

    # ── IS2M — Institut des Métiers de la Mine (Zouerate) ────────────────────
    ("صيانة مناجمية",               "Maintenance Minière",           "is2m",       None),
    ("طوبوغرافيا",                  "Topographie",                   "is2m",       None),
    ("معدنيات",                     "Minéralurgie",                  "is2m",       None),
    ("أمن صناعي",                   "Sécurité Industrielle",         "is2m",       None),

    # ── ISTP — Institut des Travaux Publics (Aleg) ───────────────────────────
    ("إنشاء طرق",                   "Construction de Routes",        "istp",       None),
    ("منشآت فنية",                  "Ouvrages d'Art",                "istp",       None),
    ("طوبوغرافيا",                  "Topographie",                   "istp",       None),

    # ── ISET — Institut Sup. d'Enseignement Technologique (Rosso) ────────────
    ("إنتاج نباتي",                 "Production Végétale",           "iset",       None),
    ("صحة حيوانية",                 "Santé Animale",                 "iset",       None),
    ("صناعات غذائية",               "Industries Agroalimentaires",   "iset",       None),
    ("هندسة ريفية",                 "Génie Rural",                   "iset",       None),
    ("كهربائية ميكانيكية",          "Électromécanique",              "iset",       None),
    ("زراعة",                       "Agronomie",                     "iset",       None),
    ("بستنة",                       "Horticulture",                  "iset",       None),
    ("أحياء دقيقة",                 "Microbiologie",                 "iset",       None),

    # ── ISCAE — Institut Sup. de Comptabilité & Administration ───────────────
    ("محاسبة",                      "Comptabilité",                  "iscae",      None),
    ("مالية",                       "Finance",                       "iscae",      None),
    ("تسويق",                       "Marketing",                     "iscae",      None),
    ("تدقيق",                       "Audit",                         "iscae",      None),
    ("تسيير موارد بشرية",           "Gestion des Ressources Humaines","iscae",     None),

    # ── ISEM — Institut Sup. des Études Maritimes (Nouadhibou) ───────────────
    ("ملاحة",                       "Navigation",                    "isem",       None),
    ("ميكانيكا بحرية",              "Mécanique Navale",              "isem",       None),
    ("تسيير الصيد",                 "Gestion des Pêches",            "isem",       None),
]

# ─── INSERT ───────────────────────────────────────────────────────────────────
print("⏳ Insertion des filières...")
fac_sql = []
for slug, name_fr, name_ar, icon, order in FACULTIES:
    safe_fr  = name_fr.replace("'", "''")
    safe_ar  = name_ar.replace("'", "''")
    safe_ico = icon.replace("'", "''")
    fac_sql.append(
        f"INSERT INTO faculties (slug, name_fr, name_ar, icon, sort_order) "
        f"VALUES ('{slug}','{safe_fr}','{safe_ar}','{safe_ico}',{order}) "
        f"ON CONFLICT (slug) DO UPDATE SET name_fr=EXCLUDED.name_fr, name_ar=EXCLUDED.name_ar, "
        f"icon=EXCLUDED.icon, sort_order=EXCLUDED.sort_order;"
    )

result = psql_many(fac_sql)
print(f"  → {result.count('INSERT') + result.count('UPDATE')} filières traitées")

print("⏳ Insertion des matières...")
sub_sql = []
for name_ar, name_fr, faculty_slug, year in SUBJECTS:
    safe_ar = name_ar.replace("'", "''")
    safe_fr = name_fr.replace("'", "''")
    year_val = str(year) if year else "NULL"
    sub_sql.append(
        f"INSERT INTO subjects (name_ar, name_fr, faculty_slug, year) "
        f"VALUES ('{safe_ar}','{safe_fr}','{faculty_slug}',{year_val}) "
        f"ON CONFLICT (name_ar, faculty_slug, year) DO NOTHING;"
    )

result2 = psql_many(sub_sql)
inserted = result2.count("INSERT 0 1")
skipped  = result2.count("INSERT 0 0")
print(f"  → {inserted} matières insérées, {skipped} déjà existantes")

# Verify
r = subprocess.run(["psql", DB, "-c",
    "SELECT f.slug, COUNT(s.id) AS nb FROM faculties f LEFT JOIN subjects s ON s.faculty_slug=f.slug GROUP BY f.slug ORDER BY f.sort_order;"],
    capture_output=True, text=True)
print("\n📊 Résumé par filière:")
print(r.stdout)
