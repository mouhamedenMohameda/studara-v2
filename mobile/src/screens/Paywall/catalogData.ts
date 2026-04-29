/**
 * Données catalogue Paywall — alignées sur api/.../032_catalog_plans_elite_grid.sql
 * (secours si l’API distante n’expose pas encore GET /catalog/subscriptions).
 */

export interface PaywallCatalogPlan {
  code: string;
  displayNameFr: string;
  descriptionFr: string;
  monthlyPriceMru: number;
  sortOrder: number;
}

/** Textes « vente » par code de plan (FR + AR) — utilisés dans l’app même si l’API renvoie une courte `descriptionFr`. */
export interface PlanSellingCopy {
  taglineFr: string;
  taglineAr: string;
  bulletsFr: string[];
  bulletsAr: string[];
}

export const PLAN_SELLING_COPY: Record<string, PlanSellingCopy> = {
  essential: {
    taglineFr: 'Ton copilote IA pour réviser un peu chaque jour, sans te perdre dans les outils.',
    taglineAr: 'مساعد ذكي يومي للمراجعة — بسيط، واضح، ومناسب للبداية.',
    bulletsFr: [
      'Pose tes questions comme en chat : cours, défis, méthodo.',
      'QCM, vrai/faux et questions ouvertes générés à partir de tes sujets.',
      'Explications claires, pas à pas, adaptées à ton niveau.',
      'Reformule et résume pour mieux retenir avant les contrôles.',
      'Parfait si tu veux Studara+ accessible et efficace au quotidien.',
    ],
    bulletsAr: [
      'اسأل كما في محادثة: دروس، تمارين، منهجية.',
      'اختيار من متعدد وصحيح/خطأ وأسئلة مفتوحة حسب موضوعك.',
      'شرح مبسّط خطوة بخطوة يناسب مستواك.',
      'إعادة صياغة وتلخيص لتثبيت الدروس قبل الفروض.',
      'مناسب لمن يريد مساعدة يومية بسعر معقول.',
    ],
  },
  course_pdf: {
    taglineFr: 'Quand ton vrai matériel de cours entre dans Studara : PDF, scans, polycopiés.',
    taglineAr: 'عندما تصبح ملفاتك ودروسك الحقيقية جزءاً من المساعد الذكي.',
    bulletsFr: [
      'Envoie cours et PDF : l’IA lit ton contenu et répond dans ce cadre.',
      'Scans et photos de notes : idéal pour retravailler après l’amphi.',
      'Questions ciblées sur un chapitre ou une page précise.',
      'Mémoire de révision : l’IA s’appuie sur tes matières chargées.',
      'Le sweet spot pour sérieux et partiels — le plus choisi.',
    ],
    bulletsAr: [
      'ارفع الدروس وPDF: الذكاء يقرأ محتواك ويجيب في نفس الإطار.',
      'مسح الصفحات والصور — مراجعة بعد المحاضرة بسهولة.',
      'أسئلة مركّزة على فصل أو صفحة محددة.',
      'ذاكرة مراجعة مرتبطة بموادك المحمّلة.',
      'الخيار المفضّل للجدّيين وقبل الامتحانات.',
    ],
  },
  elite_pass_7d: {
    taglineFr: 'Une semaine « tout terrain » pour blitz tes révisions : plus de marge, plus de profondeur.',
    taglineAr: 'أسبوع مكثّف: قوة أعلى وذاكرة أوسع عندما تقترب المواعيد.',
    bulletsFr: [
      'Format 7 jours : pensé pour un rush avant DS ou examen.',
      'Contextes longs : suites de questions sur un gros sujet sans repartir de zéro.',
      'Réponses premium : analyses plus poussées quand ça compte.',
      'Priorité sur le traitement : moins d’attente aux heures chargées.',
      'À activer au bon moment — tu paies la semaine où tu en as besoin.',
    ],
    bulletsAr: [
      'صيغة ٧ أيام: مخصّصة للدفع قبل الفرض أو الامتحان.',
      'سياق طويل: سلسلة أسئلة على موضوع كبير دون البدء من الصفر.',
      'إجابات مميّزة وأعمق عند الحاجة.',
      'أولوية في المعالجة وقت الذروة.',
      'فعّلها في الأسبوع الذي تحتاج فيه القوة القصوى.',
    ],
  },
  elite_monthly: {
    taglineFr: 'Pour celles et ceux qui vivent sur Studara : l’expérience la plus exigeante, tout le mois.',
    taglineAr: 'لمن يعتمد على التطبيق يومياً: أقوى تجربة على مدار الشهر.',
    bulletsFr: [
      'Plafonds les plus hauts : messages, documents, analyses.',
      'Sessions longues et sujets lourds : l’IA reste dans le détail avec toi.',
      'Accès premium complet : idéal projets, mémoires, prépas intensives.',
      'Confort maximal si tu enchaînes TD, fiches et questions.',
      'Un seul abonnement mensuel — tu te concentres sur tes résultats.',
    ],
    bulletsAr: [
      'أعلى سقوف للرسائل والوثائق والتحليلات.',
      'جلسات طويلة ومواضيع ثقيلة مع تفاصيل أغنى.',
      'وصول مميّز كامل: مشاريع، مذكرات، تحضير مكثّف.',
      'راحة أكبر إن كنت تتابع تمارين وملخصات وأسئلة بلا انقطاع.',
      'اشتراك شهري واحد — ركّز على نتائجك.',
    ],
  },
};

export function normalizeCatalogPayload(data: unknown): PaywallCatalogPlan[] {
  if (Array.isArray(data)) return data as PaywallCatalogPlan[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.plans)) return o.plans as PaywallCatalogPlan[];
    if (Array.isArray(o.subscriptions)) return o.subscriptions as PaywallCatalogPlan[];
  }
  return [];
}

/** Dernière grille connue (à tenir synchro avec la migration catalogue). */
export const PAYWALL_CATALOG_FALLBACK: PaywallCatalogPlan[] = [
  {
    code: 'essential',
    displayNameFr: 'Studara Essentiel',
    descriptionFr:
      'Pour réviser au quotidien avec l’IA, poser des questions, générer des QCM et obtenir des explications claires.',
    monthlyPriceMru: 150,
    sortOrder: 1,
  },
  {
    code: 'course_pdf',
    displayNameFr: 'Studara Cours & PDF',
    descriptionFr:
      'Pour travailler directement sur tes cours, PDF et scans, avec une IA plus utile pour les documents.',
    monthlyPriceMru: 250,
    sortOrder: 2,
  },
  {
    code: 'elite_pass_7d',
    displayNameFr: 'Studara Elite Pass Hebdo',
    descriptionFr:
      'Pour une semaine de révision intensive avec plus de puissance, plus de mémoire et plus de traitement premium.',
    monthlyPriceMru: 349,
    sortOrder: 3,
  },
  {
    code: 'elite_monthly',
    displayNameFr: 'Studara Elite Mensuel',
    descriptionFr:
      'Pour les gros utilisateurs qui veulent la version la plus avancée sur tout le mois.',
    monthlyPriceMru: 1000,
    sortOrder: 4,
  },
];
