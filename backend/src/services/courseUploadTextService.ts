import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import pdfParse from 'pdf-parse';

import { visionPrompt as geminiVisionPrompt } from './geminiService';

const execFileAsync = promisify(execFile);

const OFFICE_EXTS = new Set(['.ppt', '.pptx', '.doc', '.docx']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const MAX_EXTRACTED_CHARS = 200_000;

async function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function convertOfficeToPdf(basePath: string, ext: string): Promise<string | null> {
  const cacheDir = path.join(path.dirname(basePath), 'preview_cache');
  await ensureDir(cacheDir);
  const pdfPath = path.join(cacheDir, `${path.basename(basePath, ext)}.pdf`);
  if (fs.existsSync(pdfPath)) return pdfPath;

  await execFileAsync('libreoffice', ['--headless', '--convert-to', 'pdf', '--outdir', cacheDir, basePath], {
    timeout: 120_000,
  });

  const generatedName = path.join(cacheDir, path.basename(basePath, ext) + '.pdf');
  if (fs.existsSync(generatedName) && generatedName !== pdfPath) {
    fs.renameSync(generatedName, pdfPath);
  }
  return fs.existsSync(pdfPath) ? pdfPath : null;
}

async function extractTextFromPdf(pdfPath: string): Promise<{ text: string; pageCount: number | null }> {
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  const pageCount =
    typeof (data as any).numpages === 'number' && Number.isFinite((data as any).numpages)
      ? Math.max(1, Math.floor((data as any).numpages))
      : null;
  const raw = (typeof (data as any).text === 'string' ? (data as any).text : '').replace(/\u0000/g, '').trim();
  return { text: raw, pageCount };
}

async function extractTextFromImageWithVision(filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const b64 = buf.toString('base64');
  const prompt =
    `Lis cette image de cours/scan. Extrais TOUT le texte fidèlement.\n` +
    `- Respecte les sauts de lignes quand c'est possible.\n` +
    `- Ne corrige pas en inventant: si un mot est illisible, mets [illisible].\n` +
    `Réponds uniquement avec le texte extrait (pas de JSON, pas de commentaire).`;

  // Gemini vision is already in the codebase (falls back handled by caller if needed).
  const out = await geminiVisionPrompt(b64, 'image/jpeg', prompt, 3500);
  return String(out || '').trim();
}

export async function extractUploadText(params: {
  filePath: string;
  originalName: string;
  mimeType: string;
}): Promise<{ text: string; source: 'pdf' | 'office_pdf' | 'vision_ocr' | 'unknown'; pageCount: number | null }> {
  const ext = path.extname(params.originalName || params.filePath).toLowerCase();
  const basePath = params.filePath;

  if (ext === '.pdf') {
    const { text, pageCount } = await extractTextFromPdf(basePath);
    return { text, source: 'pdf', pageCount };
  }

  if (OFFICE_EXTS.has(ext)) {
    const pdfPath = await convertOfficeToPdf(basePath, ext);
    if (!pdfPath) throw new Error('Impossible de convertir le fichier Office en PDF sur le serveur.');
    const { text, pageCount } = await extractTextFromPdf(pdfPath);
    return { text, source: 'office_pdf', pageCount };
  }

  if (IMAGE_EXTS.has(ext) || params.mimeType.startsWith('image/')) {
    const text = await extractTextFromImageWithVision(basePath);
    return { text, source: 'vision_ocr', pageCount: 1 };
  }

  // Fallback: try pdf-parse anyway
  try {
    const { text, pageCount } = await extractTextFromPdf(basePath);
    return { text, source: 'unknown', pageCount };
  } catch {
    throw new Error('Type de fichier non supporté pour extraction texte.');
  }
}

export function normalizeExtractedText(raw: string): { cleaned: string; wordCount: number; truncated: boolean } {
  const cleaned = String(raw || '')
    .replace(/\u0000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const truncated = cleaned.length > MAX_EXTRACTED_CHARS;
  const out = truncated ? cleaned.slice(0, MAX_EXTRACTED_CHARS) : cleaned;
  const wordCount = out ? out.split(/\s+/).filter(Boolean).length : 0;
  return { cleaned: out, wordCount, truncated };
}

