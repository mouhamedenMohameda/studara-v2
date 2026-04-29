import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import pdfParse from 'pdf-parse';

const execFileAsync = promisify(execFile);

const OFFICE_EXTS = new Set(['.ppt', '.pptx', '.doc', '.docx']);

/** Limite prudente pour rester sous le contexte Groq (prompt + sortie). */
export const MAX_EXTRACTED_COURSE_CHARS = 120_000;

function uploadsRoot(): string {
  return path.join(__dirname, '../../uploads');
}

/**
 * Retourne le chemin d'un PDF lisible (fichier .pdf ou conversion cache pour Office).
 */
export async function resolvePdfPathForResource(resourceId: string, fileUrl: string): Promise<string | null> {
  if (!fileUrl.startsWith('/uploads/')) return null;

  const filename = fileUrl.replace('/uploads/', '');
  const basePath = path.join(uploadsRoot(), filename);
  if (!fs.existsSync(basePath)) return null;

  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return basePath;

  if (OFFICE_EXTS.has(ext)) {
    const cacheDir = path.join(uploadsRoot(), 'preview_cache');
    const pdfPath = path.join(cacheDir, `${resourceId}.pdf`);
    if (fs.existsSync(pdfPath)) return pdfPath;

    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    await execFileAsync(
      'libreoffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', cacheDir, basePath],
      { timeout: 120_000 },
    );

    const generatedName = path.join(cacheDir, path.basename(filename, ext) + '.pdf');
    if (fs.existsSync(generatedName) && generatedName !== pdfPath) {
      fs.renameSync(generatedName, pdfPath);
    }
    return fs.existsSync(pdfPath) ? pdfPath : null;
  }

  return null;
}

export async function extractTextFromPdfFile(pdfPath: string): Promise<string> {
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  return typeof data.text === 'string' ? data.text : '';
}

export type CourseTextSource = 'pdf' | 'metadata_only';

export async function extractCourseTextForSummary(
  resourceId: string,
  fileUrl: string | null | undefined,
  meta: {
    title: string;
    title_ar: string | null;
    subject: string;
    description: string | null;
    resource_type: string;
    tags: string[];
  },
): Promise<{ text: string; source: CourseTextSource; truncated: boolean; pageCount: number | null; wordCount: number }> {
  const tags = (meta.tags || []).join(', ');
  const fallback = [
    'Contenu fourni (métadonnées uniquement — pas de texte extractible du fichier sur le serveur) :',
    `Titre : ${meta.title}`,
    meta.title_ar ? `Titre (AR) : ${meta.title_ar}` : '',
    `Matière : ${meta.subject}`,
    `Type de ressource : ${meta.resource_type}`,
    meta.description ? `Description : ${meta.description}` : '',
    tags ? `Tags : ${tags}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (!fileUrl) {
    return { text: fallback, source: 'metadata_only', truncated: false, pageCount: null, wordCount: 0 };
  }

  try {
    const pdfPath = await resolvePdfPathForResource(resourceId, fileUrl);
    if (!pdfPath) {
      return { text: fallback, source: 'metadata_only', truncated: false, pageCount: null, wordCount: 0 };
    }

    const buf = fs.readFileSync(pdfPath);
    const data = await pdfParse(buf);
    const pageCount =
      typeof (data as any).numpages === 'number' && Number.isFinite((data as any).numpages)
        ? Math.max(1, Math.floor((data as any).numpages))
        : null;

    const raw = (typeof (data as any).text === 'string' ? (data as any).text : '').replace(/\u0000/g, '').trim();
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    const wordCount = cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0;

    if (cleaned.length < 80) {
      return {
        text: `${fallback}\n\n[Extraction PDF — texte quasi vide ou non lisible]\n${raw.slice(0, 4000)}`,
        source: 'metadata_only',
        truncated: false,
        pageCount,
        wordCount,
      };
    }

    if (cleaned.length > MAX_EXTRACTED_COURSE_CHARS) {
      return {
        text: cleaned.slice(0, MAX_EXTRACTED_COURSE_CHARS),
        source: 'pdf',
        truncated: true,
        pageCount,
        wordCount,
      };
    }

    return { text: cleaned, source: 'pdf', truncated: false, pageCount, wordCount };
  } catch (e) {
    console.error('[resourcePdfTextService]', e);
    return { text: fallback, source: 'metadata_only', truncated: false, pageCount: null, wordCount: 0 };
  }
}
