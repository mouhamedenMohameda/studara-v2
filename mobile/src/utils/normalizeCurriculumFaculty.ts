import { Faculty } from '../types';

/**
 * The app currently has 2 parallel notions:
 * - Academic structure slugs (ex: una-fm, una-fst, poly-ipgei...)
 * - Curriculum/resource buckets (Faculty enum: sciences, medicine, law, economics, arts, engineering, islamic)
 *
 * This helper maps academic slugs to the curriculum bucket used by:
 * - /resources?faculty=
 * - /resources/subjects?faculty=
 * - admin curriculum tables (faculties/subjects)
 */
export function normalizeCurriculumFacultySlug(
  facultySlug?: string | null,
  filiereSlug?: string | null,
): Faculty | null {
  const f = (facultySlug ?? '').trim();
  const fil = (filiereSlug ?? '').trim();
  if (!f) return null;

  // Already a curriculum bucket
  const buckets = new Set<string>([
    Faculty.Sciences,
    Faculty.Medicine,
    Faculty.Law,
    Faculty.Economics,
    Faculty.Arts,
    Faculty.Engineering,
    Faculty.Islamic,
  ]);
  if (buckets.has(f)) return f as Faculty;

  // Academic structure → curriculum bucket
  const direct: Record<string, Faculty> = {
    // UNA
    'una-fst': Faculty.Sciences,
    'una-fm': Faculty.Medicine,
    'una-flsh': Faculty.Arts,
    'una-fsi': Faculty.Islamic,
    // Polytech / ISET / engineering-like institutes
    'poly-ipgei': Faculty.Engineering,
    'poly-numerique': Faculty.Engineering,
    'poly-aleg': Faculty.Engineering,
    'poly-zouerat': Faculty.Engineering,
    'poly-energie': Faculty.Engineering,
    'poly-statistique': Faculty.Engineering,
    'iset-genie': Faculty.Engineering,
    'iset-agro': Faculty.Engineering,
    // ISERI
    'iseri-quran': Faculty.Islamic,
    'iseri-fiqh': Faculty.Islamic,
  };
  if (direct[f]) return direct[f];

  // UNA FSJE is mixed: law + economics.
  if (f === 'una-fsje') {
    if (/^fsje-(eco|gestion|finance)/.test(fil)) return Faculty.Economics;
    if (/^fsje-droit-/.test(fil)) return Faculty.Law;
    // Fallback: keep law (more common for generic "droit" resources)
    return Faculty.Law;
  }

  // Filiere-only hints (in case caller passes a filiere but unknown faculty)
  if (/^fm-/.test(fil)) return Faculty.Medicine;
  if (/^fst-/.test(fil)) return Faculty.Sciences;
  if (/^flsh-/.test(fil)) return Faculty.Arts;
  if (/^fsi-/.test(fil) || /^iseri-/.test(fil)) return Faculty.Islamic;
  if (/^ipgei-|^num-|^aleg-|^zouerat-|^ener-|^stat-|^iset-/.test(fil)) return Faculty.Engineering;
  if (/^fsje-/.test(fil)) return Faculty.Law;

  return null;
}

