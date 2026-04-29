/**
 * ACADEMIC_STRUCTURE
 * Hiérarchie complète des établissements d'enseignement supérieur mauritaniens.
 *
 * Structure : Université / Complexe → Faculté / Institut → Filière
 *
 * Types :
 *  - 'faculty'         → كلية  (faculté classique LMD)
 *  - 'institute'       → معهد  (institut LMD)
 *  - 'preparatory'     → أقسام تحضيرية (2 ans, puis concours grande école)
 *  - 'prepa-engineer'  → IPGEI : 2 ans prépa + 3 ans spécialité → diplôme ingénieur
 */

export interface Filiere {
  slug: string;
  nameAr: string;
  nameFr: string;
}

export interface FacultyOrInstitut {
  slug: string;
  nameAr: string;
  nameFr: string;
  type: 'faculty' | 'institute' | 'preparatory' | 'prepa-engineer';
  /** Note sur le diplôme délivré (ex: "Diplôme d'ingénieur d'État — 5 ans") */
  diplomaNote?: string;
  /** Nombre d'années de la formation (ex: 2, 3, 5, 7) */
  numYears?: number;
  filieres: Filiere[];
}

export interface UniversityNode {
  slug: string;
  nameAr: string;
  nameFr: string;
  city: string;
  /** Faculties or Instituts under this university */
  faculties: FacultyOrInstitut[];
}

export const ACADEMIC_STRUCTURE: UniversityNode[] = [
  // ─────────────────────────────────────────────────────────────────
  // UNA — Université de Nouakchott Al-Asriya / جامعة نواكشوط العصرية
  // ─────────────────────────────────────────────────────────────────
  {
    slug: 'una',
    nameAr: 'جامعة نواكشوط العصرية',
    nameFr: 'Université de Nouakchott Al-Asriya',
    city: 'نواكشوط',
    faculties: [
      {
        slug: 'una-fst',
        nameAr: 'كلية العلوم والتقنيات',
        nameFr: 'Faculté des Sciences et Techniques',
        type: 'faculty',
        filieres: [
          { slug: 'fst-math',     nameAr: 'الرياضيات',           nameFr: 'Mathématiques' },
          { slug: 'fst-info',     nameAr: 'الإعلامية',            nameFr: 'Informatique' },
          { slug: 'fst-physique', nameAr: 'الفيزياء',             nameFr: 'Physique' },
          { slug: 'fst-chimie',   nameAr: 'الكيمياء',             nameFr: 'Chimie' },
          { slug: 'fst-svt',      nameAr: 'علوم الحياة والأرض',   nameFr: 'Sciences de la Vie et de la Terre' },
          { slug: 'fst-geo-sci',  nameAr: 'الجيولوجيا',           nameFr: 'Géologie' },
        ],
      },
      {
        slug: 'una-flsh',
        nameAr: 'كلية الآداب والعلوم الإنسانية',
        nameFr: 'Faculté des Lettres et Sciences Humaines',
        type: 'faculty',
        filieres: [
          { slug: 'flsh-arabe',    nameAr: 'اللغة العربية وآدابها', nameFr: 'Langue et Littérature Arabes' },
          { slug: 'flsh-francais', nameAr: 'اللغة الفرنسية',        nameFr: 'Langue Française' },
          { slug: 'flsh-anglais',  nameAr: 'اللغة الإنجليزية',      nameFr: 'Langue Anglaise' },
          { slug: 'flsh-histoire', nameAr: 'التاريخ',               nameFr: 'Histoire' },
          { slug: 'flsh-geo',      nameAr: 'الجغرافيا',             nameFr: 'Géographie' },
          { slug: 'flsh-philo',    nameAr: 'الفلسفة',               nameFr: 'Philosophie' },
          { slug: 'flsh-socio',    nameAr: 'علم الاجتماع',          nameFr: 'Sociologie' },
          { slug: 'flsh-psycho',   nameAr: 'علم النفس',             nameFr: 'Psychologie' },
        ],
      },
      {
        slug: 'una-fsje',
        nameAr: 'كلية الحقوق والعلوم الاقتصادية',
        nameFr: 'Faculté des Sciences Juridiques et Économiques',
        type: 'faculty',
        filieres: [
          { slug: 'fsje-droit-prive',  nameAr: 'الحقوق الخاصة',  nameFr: 'Droit Privé' },
          { slug: 'fsje-droit-public', nameAr: 'الحقوق العامة',  nameFr: 'Droit Public' },
          { slug: 'fsje-eco',          nameAr: 'الاقتصاد',        nameFr: 'Économie' },
          { slug: 'fsje-gestion',      nameAr: 'التسيير',         nameFr: 'Gestion' },
          { slug: 'fsje-finance',      nameAr: 'المالية',         nameFr: 'Finance' },
        ],
      },
      {
        slug: 'una-fsi',
        nameAr: 'كلية العلوم الإسلامية',
        nameFr: 'Faculté des Sciences Islamiques',
        type: 'faculty',
        filieres: [
          { slug: 'fsi-sharia',  nameAr: 'الشريعة الإسلامية', nameFr: 'Charia Islamique' },
          { slug: 'fsi-ousoul',  nameAr: 'أصول الدين',         nameFr: 'Ousoul al-Din' },
          { slug: 'fsi-dawah',   nameAr: 'الدعوة والإعلام',    nameFr: 'Dawa et Communication' },
        ],
      },
      {
        slug: 'una-fm',
        nameAr: 'كلية الطب',
        nameFr: 'Faculté de Médecine',
        type: 'faculty',
        filieres: [
          { slug: 'fm-generale',  nameAr: 'الطب العام',   nameFr: 'Médecine Générale' },
          { slug: 'fm-pharmacie', nameAr: 'الصيدلة',      nameFr: 'Pharmacie' },
          { slug: 'fm-dentaire',  nameAr: 'طب الأسنان',   nameFr: 'Chirurgie Dentaire' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // Complexe Polytechnique — المركب البوليتقني
  // (établissement autonome sous tutelle du MESRS)
  //
  //  ┌─ IPGEI       : 2 ans prépa → concours → spécialités 3/4/5e année → ingénieur d'État
  //  ├─ Inst. Numérique  : LMD
  //  ├─ Inst. d'Aleg     : LMD
  //  ├─ Inst. de Zouérat : LMD
  //  ├─ Inst. d'Énergie  : LMD
  //  └─ Inst. de Statistique : LMD
  // ─────────────────────────────────────────────────────────────────
  {
    slug: 'polytechnique',
    nameAr: 'المركب البوليتقني',
    nameFr: 'Complexe Polytechnique',
    city: 'نواكشوط',
    faculties: [
      // ── IPGEI ────────────────────────────────────────────────────
      {
        slug: 'poly-ipgei',
        nameAr: 'المعهد التحضيري للدراسات الهندسية والصناعية (IPGEI)',
        nameFr: 'Institut Préparatoire aux Grandes Écoles d\'Ingénieurs (IPGEI)',
        type: 'prepa-engineer',
        diplomaNote: 'Diplôme d\'ingénieur d\'État (5 ans) — 2 ans prépa + 3 ans spécialité au sein du Complexe',
        filieres: [
          // Années 1 & 2 — Classes préparatoires
          { slug: 'ipgei-prepa-mp',   nameAr: 'الرياضيات والفيزياء (MP) — تحضيري',       nameFr: 'Prépa MP (Maths-Physique)' },
          { slug: 'ipgei-prepa-pt',   nameAr: 'الفيزياء والتقنية (PT) — تحضيري',          nameFr: 'Prépa PT (Physique-Technologie)' },
          { slug: 'ipgei-prepa-bcpst',nameAr: 'أحياء وكيمياء وفيزياء (BCPST) — تحضيري',  nameFr: 'Prépa BCPST' },
          // Années 3, 4 & 5 — Spécialités ingénieur (admis sur concours post-prépa)
          { slug: 'ipgei-gc',         nameAr: 'الهندسة المدنية (سنوات ٣-٤-٥)',             nameFr: 'Génie Civil (3e→5e an.)' },
          { slug: 'ipgei-ee',         nameAr: 'الهندسة الكهربائية (سنوات ٣-٤-٥)',          nameFr: 'Génie Électrique (3e→5e an.)' },
          { slug: 'ipgei-info',       nameAr: 'هندسة المعلوماتية (سنوات ٣-٤-٥)',           nameFr: 'Génie Informatique (3e→5e an.)' },
          { slug: 'ipgei-mines',      nameAr: 'هندسة التعدين والمعادن (سنوات ٣-٤-٥)',      nameFr: 'Génie Minier (3e→5e an.)' },
          { slug: 'ipgei-meca',       nameAr: 'الهندسة الميكانيكية (سنوات ٣-٤-٥)',         nameFr: 'Génie Mécanique (3e→5e an.)' },
          { slug: 'ipgei-indus',      nameAr: 'الهندسة الصناعية (سنوات ٣-٤-٥)',            nameFr: 'Génie Industriel (3e→5e an.)' },
        ],
      },

      // ── Institut du Numérique ─────────────────────────────────────
      {
        slug: 'poly-numerique',
        nameAr: 'معهد الرقمنة والتكنولوجيا',
        nameFr: 'Institut du Numérique',
        type: 'institute',
        diplomaNote: 'Licence / Master LMD',
        filieres: [
          { slug: 'num-info',       nameAr: 'الإعلامية والبرمجة',       nameFr: 'Informatique et Programmation' },
          { slug: 'num-reseaux',    nameAr: 'الشبكات والاتصالات',        nameFr: 'Réseaux et Télécommunications' },
          { slug: 'num-cyber',      nameAr: 'الأمن المعلوماتي',          nameFr: 'Cybersécurité' },
          { slug: 'num-ia',         nameAr: 'الذكاء الاصطناعي والبيانات',nameFr: 'Intelligence Artificielle et Data' },
          { slug: 'num-dev-logiciel',nameAr: 'هندسة البرمجيات',          nameFr: 'Génie Logiciel' },
        ],
      },

      // ── Institut d'Aleg ───────────────────────────────────────────
      {
        slug: 'poly-aleg',
        nameAr: 'معهد ألاك',
        nameFr: 'Institut d\'Aleg',
        type: 'institute',
        diplomaNote: 'Licence / Master LMD',
        filieres: [
          { slug: 'aleg-agro',      nameAr: 'الهندسة الزراعية',          nameFr: 'Agronomie' },
          { slug: 'aleg-elevage',   nameAr: 'الثروة الحيوانية',           nameFr: 'Élevage et Productions Animales' },
          { slug: 'aleg-env',       nameAr: 'البيئة والتنمية المستدامة',  nameFr: 'Environnement et Développement Durable' },
          { slug: 'aleg-hydraul',   nameAr: 'الهيدروليك والموارد المائية',nameFr: 'Hydraulique et Ressources en Eau' },
        ],
      },

      // ── Institut de Zouérat ───────────────────────────────────────
      {
        slug: 'poly-zouerat',
        nameAr: 'معهد زويرات',
        nameFr: 'Institut de Zouérat',
        type: 'institute',
        diplomaNote: 'Licence / Master LMD',
        filieres: [
          { slug: 'zouerat-mines',  nameAr: 'هندسة التعدين والمناجم',    nameFr: 'Génie Minier et Exploitation' },
          { slug: 'zouerat-geo',    nameAr: 'الجيولوجيا التطبيقية',       nameFr: 'Géologie Appliquée' },
          { slug: 'zouerat-maint',  nameAr: 'صيانة المعدات الثقيلة',      nameFr: 'Maintenance des Équipements Lourds' },
          { slug: 'zouerat-meca',   nameAr: 'الميكانيك الصناعي',          nameFr: 'Mécanique Industrielle' },
        ],
      },

      // ── Institut d'Énergie ────────────────────────────────────────
      {
        slug: 'poly-energie',
        nameAr: 'معهد الطاقة',
        nameFr: 'Institut d\'Énergie',
        type: 'institute',
        diplomaNote: 'Licence / Master LMD',
        filieres: [
          { slug: 'ener-renouv',    nameAr: 'الطاقات المتجددة',           nameFr: 'Énergies Renouvelables' },
          { slug: 'ener-electr',    nameAr: 'الهندسة الكهربائية والطاقة', nameFr: 'Électrotechnique et Énergie' },
          { slug: 'ener-petrole',   nameAr: 'هندسة النفط والغاز',          nameFr: 'Génie Pétrolier et Gazier' },
          { slug: 'ener-efficacite',nameAr: 'كفاءة الطاقة والبناء المستدام',nameFr: 'Efficacité Énergétique et Bâtiment Durable' },
        ],
      },

      // ── Institut de Statistique ───────────────────────────────────
      {
        slug: 'poly-statistique',
        nameAr: 'معهد الإحصاء وتحليل البيانات',
        nameFr: 'Institut de Statistique',
        type: 'institute',
        diplomaNote: 'Licence / Master LMD',
        filieres: [
          { slug: 'stat-stats',     nameAr: 'الإحصاء والاحتمالات',        nameFr: 'Statistiques et Probabilités' },
          { slug: 'stat-demo',      nameAr: 'الديموغرافيا',               nameFr: 'Démographie' },
          { slug: 'stat-data',      nameAr: 'تحليل البيانات والنمذجة',    nameFr: 'Analyse des Données et Modélisation' },
          { slug: 'stat-actuariat', nameAr: 'الاكتواريات والتأمين',        nameFr: 'Actuariat et Assurance' },
        ],
      },
    ],
  },
  //         المعهد العالي للتعليم التكنولوجي — روصو
  // ─────────────────────────────────────────────────────────────────
  {
    slug: 'ise',
    nameAr: 'المعهد العالي للتعليم التكنولوجي — روصو',
    nameFr: 'Institut Supérieur d\'Enseignement Technologique (Rosso)',
    city: 'روصو',
    faculties: [
      {
        slug: 'iset-genie',
        nameAr: 'معهد الهندسة والتقنيات',
        nameFr: 'Institut Génie et Technologies',
        type: 'institute',
        filieres: [
          { slug: 'iset-maintenance', nameAr: 'الصيانة الصناعية',  nameFr: 'Maintenance Industrielle' },
          { slug: 'iset-telecoms',    nameAr: 'الاتصالات',           nameFr: 'Télécommunications' },
          { slug: 'iset-energie',     nameAr: 'هندسة الطاقة',       nameFr: 'Génie Énergie' },
          { slug: 'iset-info-iset',   nameAr: 'الإعلامية التطبيقية',nameFr: 'Informatique Appliquée' },
        ],
      },
      {
        slug: 'iset-agro',
        nameAr: 'معهد العلوم الزراعية والبيئة',
        nameFr: 'Institut des Sciences Agronomiques et de l\'Environnement',
        type: 'institute',
        filieres: [
          { slug: 'iset-agro-fil',   nameAr: 'الهندسة الزراعية',    nameFr: 'Agronomie' },
          { slug: 'iset-env',        nameAr: 'البيئة والتنمية',      nameFr: 'Environnement et Développement' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // ISERI — Institut Sup. d'Enseignement des Ressources Islamiques
  //          المعهد العالي للدراسات الإسلامية
  // ─────────────────────────────────────────────────────────────────
  {
    slug: 'iseri',
    nameAr: 'المعهد العالي للدراسات الإسلامية',
    nameFr: 'Institut Supérieur d\'Enseignement des Ressources Islamiques',
    city: 'نواكشوط',
    faculties: [
      {
        slug: 'iseri-quran',
        nameAr: 'معهد القرآن الكريم وعلومه',
        nameFr: 'Institut du Coran et de ses Sciences',
        type: 'institute',
        filieres: [
          { slug: 'iseri-quran-fil',  nameAr: 'القرآن الكريم والتفسير', nameFr: 'Coran et Exégèse' },
          { slug: 'iseri-tajwid',     nameAr: 'التجويد والقراءات',       nameFr: 'Tajwid et Lectures Coraniques' },
        ],
      },
      {
        slug: 'iseri-fiqh',
        nameAr: 'معهد الفقه والأصول',
        nameFr: 'Institut du Fiqh et des Ousoul',
        type: 'institute',
        filieres: [
          { slug: 'iseri-usul-fiqh',  nameAr: 'أصول الفقه',    nameFr: 'Ousoul al-Fiqh' },
          { slug: 'iseri-hadith',     nameAr: 'علوم الحديث',   nameFr: 'Sciences du Hadith' },
          { slug: 'iseri-aqida',      nameAr: 'العقيدة',        nameFr: 'Aqida' },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Trouve une université par son slug */
export function getUniversity(uSlug: string): UniversityNode | undefined {
  return ACADEMIC_STRUCTURE.find(u => u.slug === uSlug);
}

/** Trouve une faculté/institut par ses slugs université + faculté */
export function getFacultyOrInstitut(uSlug: string, fSlug: string): FacultyOrInstitut | undefined {
  return getUniversity(uSlug)?.faculties.find(f => f.slug === fSlug);
}

/** Trouve une filière par ses trois slugs */
export function getFiliere(uSlug: string, fSlug: string, filSlug: string): Filiere | undefined {
  return getFacultyOrInstitut(uSlug, fSlug)?.filieres.find(fi => fi.slug === filSlug);
}

/** Type label court */
export function facultyTypeLabel(type: FacultyOrInstitut['type'], lang: 'ar' | 'fr' = 'ar'): string {
  if (lang === 'fr') {
    switch (type) {
      case 'faculty':        return 'Faculté';
      case 'institute':      return 'Institut';
      case 'preparatory':    return 'Prépa';
      case 'prepa-engineer': return 'IPGEI (Prépa → Ingénieur)';
    }
  }
  switch (type) {
    case 'faculty':        return 'كلية';
    case 'institute':      return 'معهد';
    case 'preparatory':    return 'أقسام تحضيرية';
    case 'prepa-engineer': return 'IPGEI — تحضيري + مهندس دولة';
  }
}
