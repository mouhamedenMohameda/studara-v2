import { load } from 'cheerio';

export interface FstCourse {
  code: string;
  title: string;
}

export interface FstStudentData {
  studentNumber: string;
  studentName: string;
  profile: string;
  courses: FstCourse[];
}

const ROOT_URL = 'http://resultats.una.mr/FST/pages/accueil.jsf';

export const getYearFromProfile = (profile: string): number => {
  const match = profile.match(/(\d)/);
  if (!match) return 1;
  const y = parseInt(match[1], 10);
  if (Number.isNaN(y)) return 1;
  return Math.min(7, Math.max(1, y));
};

const getFieldName = ($: ReturnType<typeof load>, selector: string, fallback: string) => {
  const n = $(selector).attr('name')?.trim();
  return n || fallback;
};

export const scrapeFstStudentData = async (studentNumberRaw: string): Promise<FstStudentData> => {
  const studentNumber = studentNumberRaw.trim().toUpperCase();

  const firstRes = await fetch(ROOT_URL, { method: 'GET' });
  if (!firstRes.ok) {
    throw new Error(`FST fetch failed (${firstRes.status})`);
  }

  const firstHtml = await firstRes.text();
  const $first = load(firstHtml);

  const actionPath = $first('form#ecriture').attr('action') || '/FST/pages/accueil.jsf';
  const actionUrl = new URL(actionPath, 'http://resultats.una.mr').toString();

  const matriculeField = getFieldName($first, 'form#ecriture input[type="text"]', 'ecriture:j_id79');
  const submitField = getFieldName($first, 'form#ecriture input[type="submit"]', 'ecriture:j_id80');
  const viewState = $first('input[name="javax.faces.ViewState"]').attr('value') || 'j_id1';

  const form = new URLSearchParams();
  form.set('ecriture', 'ecriture');
  form.set(matriculeField, studentNumber);
  form.set(submitField, 'Entrer');
  form.set('javax.faces.ViewState', viewState);

  const secondRes = await fetch(actionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!secondRes.ok) {
    throw new Error(`FST form submit failed (${secondRes.status})`);
  }

  const secondHtml = await secondRes.text();
  const $ = load(secondHtml);

  const studentName = $('span.couleurTetx')
    .filter((_i: number, el: unknown) => $(el as any).text().toLowerCase().includes('nom/pr'))
    .first()
    .closest('tr')
    .find('span.couleurTetx1')
    .first()
    .text()
    .trim();

  const profile = $('span.couleurTetx')
    .filter((_i: number, el: unknown) => $(el as any).text().toLowerCase().includes('profil'))
    .first()
    .closest('tr')
    .find('span.couleurTetx1')
    .first()
    .text()
    .trim();

  const courseSet = new Set<string>();
  $('span.couleurTetx1').each((_i: number, el: unknown) => {
    const text = $(el as any).text().replace(/\s+/g, ' ').trim();
    if (/^\([A-Z0-9]+\)\s*---\s*/i.test(text)) {
      courseSet.add(text);
    }
  });

  const courses: FstCourse[] = Array.from(courseSet).map((row) => {
    const m = row.match(/^\(([A-Z0-9]+)\)\s*---\s*(.+)$/i);
    if (!m) {
      return { code: 'UNKNOWN', title: row };
    }
    return { code: m[1].toUpperCase(), title: m[2].trim() };
  });

  if (!studentName || courses.length === 0) {
    throw new Error('No data found for this student number');
  }

  return {
    studentNumber,
    studentName,
    profile,
    courses,
  };
};
