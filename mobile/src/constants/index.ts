import { Faculty, University, DayOfWeek } from '../types';

export const APP_NAME = 'Studara';
export const APP_NAME_AR = 'ستوداره';
export const APP_TAGLINE_AR = 'رفيقك في مسيرتك الجامعية';

export const STORAGE_KEYS = {
  USER: '@studara/user',
  TOKEN: '@studara/token',
  LANGUAGE: '@studara/language',
  TIMETABLE: '@studara/timetable',
  BOOKMARKS: '@studara/bookmarks',
  ONBOARDED: '@studara/onboarded',
};

export const UNIVERSITIES: Record<University, { name: string; nameAr: string; city: string }> = {
  [University.UNA]:   { name: 'Université de Nouakchott Al Asriya',                          nameAr: 'جامعة نواكشوط العصرية',              city: 'نواكشوط' },
  [University.UPM]:   { name: 'Univ. des Sciences, de Technologie et de Médecine', nameAr: 'جامعة العلوم والتكنولوجيا والطب',  city: 'نواكشوط' },
  [University.POLYTECHNIQUE]: { name: 'Complexe Polytechnique',                            nameAr: 'المركب البوليتقني',                 city: 'نواكشوط' },
  [University.ISE]:   { name: "Institut Supérieur d'Enseignement Technologique",  nameAr: 'المعهد العالي للتعليم التكنولوجي',   city: 'روصو' },
  [University.ISERI]: { name: "Institut Sup. d'Enseignement des Ressources Islamiques", nameAr: 'المعهد العالي للدراسات الإسلامية', city: 'نواكشوط' },
};

export const FACULTIES: Record<Faculty, { name: string; nameAr: string; icon: string }> = {
  [Faculty.Sciences]:    { name: 'Sciences',         nameAr: 'العلوم',              icon: '🔬' },
  [Faculty.Medicine]:    { name: 'Médecine',          nameAr: 'الطب',               icon: '🏥' },
  [Faculty.Law]:         { name: 'Droit',             nameAr: 'الحقوق',             icon: '⚖️' },
  [Faculty.Economics]:   { name: 'Économie',          nameAr: 'الاقتصاد',           icon: '📊' },
  [Faculty.Arts]:        { name: 'Lettres & Arts',    nameAr: 'الآداب والفنون',     icon: '📚' },
  [Faculty.Engineering]: { name: 'Ingénierie',        nameAr: 'الهندسة',            icon: '⚙️' },
  [Faculty.Islamic]:     { name: 'Études Islamiques', nameAr: 'الدراسات الإسلامية', icon: '🕌' },
};

export const DAYS: Record<DayOfWeek, { short: string; shortAr: string; full: string; fullAr: string }> = {
  [DayOfWeek.Sunday]:    { short: 'Dim', shortAr: 'أحد',  full: 'Dimanche', fullAr: 'الأحد'      },
  [DayOfWeek.Monday]:    { short: 'Lun', shortAr: 'إثن',  full: 'Lundi',    fullAr: 'الاثنين'    },
  [DayOfWeek.Tuesday]:   { short: 'Mar', shortAr: 'ثلا',  full: 'Mardi',    fullAr: 'الثلاثاء'   },
  [DayOfWeek.Wednesday]: { short: 'Mer', shortAr: 'أرب',  full: 'Mercredi', fullAr: 'الأربعاء'   },
  [DayOfWeek.Thursday]:  { short: 'Jeu', shortAr: 'خمي',  full: 'Jeudi',    fullAr: 'الخميس'     },
  [DayOfWeek.Friday]:    { short: 'Ven', shortAr: 'جمع',  full: 'Vendredi', fullAr: 'الجمعة'     },
  [DayOfWeek.Saturday]:  { short: 'Sam', shortAr: 'سبت',  full: 'Samedi',   fullAr: 'السبت'      },
};

export const WORK_DAYS = [
  DayOfWeek.Sunday, DayOfWeek.Monday, DayOfWeek.Tuesday,
  DayOfWeek.Wednesday, DayOfWeek.Thursday,
];

export const COURSE_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#6366F1', '#EC4899', '#14B8A6', '#F97316', '#84CC16',
  '#06B6D4', '#A855F7',
];

export const CURRENCY      = 'Ouguiya';
export const CURRENCY_FULL = 'أوقية موريتانية';
