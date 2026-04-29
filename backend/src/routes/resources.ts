import { Router, Response, Request } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';
import { upload, validateFileType } from '../middleware/upload';
import { sendError } from '../utils/httpError';
import {
  listResources, getResource, incrementDownload, listMySubmissions,
  createResource, deleteResource, toggleLike, toggleBookmark,
} from '../services/resourceService';
import { awardXP } from '../services/xpService';

const execFileAsync = promisify(execFile);

const router = Router();

// ─── Faculty slug normalization ────────────────────────────────────────────────
// Mobile user profiles can now store academic-structure slugs (ex: una-fm),
// while curriculum/resources use the legacy 7 buckets (sciences/medicine/...).
function normalizeCurriculumFacultySlug(input?: unknown, filiere?: unknown): string | undefined {
  const s = typeof input === 'string' ? input.trim() : '';
  const fil = typeof filiere === 'string' ? filiere.trim() : '';
  if (!s) return undefined;

  // Already a bucket
  const buckets = new Set(['sciences', 'medicine', 'law', 'economics', 'arts', 'engineering', 'islamic']);
  if (buckets.has(s)) return s;

  // UNA FSJE (droit + économie). If we have the filiere slug, route to the right bucket.
  if (s === 'una-fsje') {
    if (/^fsje-(eco|gestion|finance)/.test(fil)) return 'economics';
    if (/^fsje-droit-/.test(fil)) return 'law';
    return 'law';
  }

  // Academic faculty → bucket
  const map: Record<string, string> = {
    'una-fst': 'sciences',
    'una-fm': 'medicine',
    'una-flsh': 'arts',
    'una-fsi': 'islamic',
    // Polytech / ISET
    'poly-ipgei': 'engineering',
    'poly-numerique': 'engineering',
    'poly-aleg': 'engineering',
    'poly-zouerat': 'engineering',
    'poly-energie': 'engineering',
    'poly-statistique': 'engineering',
    'iset-genie': 'engineering',
    'iset-agro': 'engineering',
    // ISERI
    'iseri-quran': 'islamic',
    'iseri-fiqh': 'islamic',
  };
  return map[s] ?? s;
}

const createSchema = z.object({
  title:        z.string().min(3),
  titleAr:      z.string().optional(),
  description:  z.string().optional(),
  resourceType: z.enum(['note', 'past_exam', 'summary', 'exercise', 'project', 'presentation', 'video_course']),
  faculty:      z.string(),
  university:   z.string(),
  subject:      z.string().min(2),
  year:         z.coerce.number().int().min(1).max(7),
  semester:     z.coerce.number().int().min(1).max(2).optional(),
  tags:         z.string().optional(),
  videoUrl:     z.string().url().optional(),
});

// GET /api/v1/resources/my-submissions — authenticated, returns own uploads with all statuses
router.get('/my-submissions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await listMySubmissions(req.user!.id);
    res.json(rows);
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

// GET /api/v1/resources
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const q = { ...(req.query as Record<string, string>) };
    if (q.faculty) q.faculty = normalizeCurriculumFacultySlug(q.faculty, q.filiere) as string;
    const result = await listResources(q);
    res.json(result);
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

// GET /api/v1/resources/:id/file?t=TOKEN
// Streams the resource file inline — token passed as query param so WebView / Google Docs Viewer
// can access the URL directly without custom Authorization headers.
router.get('/:id/file', async (req: Request, res: Response) => {
  try {
    const t = (req.query.t as string) || req.headers.authorization?.replace('Bearer ', '') || '';
    if (!t) { sendError(res, 401, 'Unauthorized'); return; }

    // Verify JWT
    const secret = process.env.JWT_SECRET ?? '';
    let userId: string;
    try {
      const payload = jwt.verify(t, secret) as { sub?: string; id?: string };
      userId = payload.sub ?? payload.id ?? '';
    } catch {
      // Try old secret for rotation window
      const oldSecret = process.env.JWT_SECRET_OLD ?? '';
      try {
        const payload = jwt.verify(t, oldSecret) as { sub?: string; id?: string };
        userId = payload.sub ?? payload.id ?? '';
      } catch {
        sendError(res, 401, 'Invalid token'); return;
      }
    }
    if (!userId) { sendError(res, 401, 'Invalid token'); return; }

    // Fetch resource
    const { rows } = await pool.query(
      `SELECT file_url, title, resource_type FROM resources WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) { sendError(res, 404, 'Not found'); return; }

    const fileUrl: string = rows[0].file_url ?? '';
    if (!fileUrl.startsWith('/uploads/')) {
      sendError(res, 400, 'No file attached'); return;
    }

    const filename = fileUrl.replace('/uploads/', '');
    const filePath = path.join(__dirname, '../../uploads', filename);
    if (!fs.existsSync(filePath)) {
      sendError(res, 404, 'File not found on server'); return;
    }

    const ext = path.extname(filename).toLowerCase();
    const MIME: Record<string, string> = {
      '.pdf':  'application/pdf',
      '.ppt':  'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.doc':  'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline'); // Never force download
    fs.createReadStream(filePath).pipe(res);
  } catch (e: any) {
    sendError(res, 500, e.message);
  }
});

// GET /api/v1/resources/:id/preview?t=TOKEN
// For Office files (PPT/PPTX/DOC/DOCX): converts to PDF via LibreOffice then streams.
// For PDFs: streams directly. Caches the converted PDF in /uploads/preview_cache/.
const OFFICE_EXTS = new Set(['.ppt', '.pptx', '.doc', '.docx']);
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const t = (req.query.t as string) || req.headers.authorization?.replace('Bearer ', '') || '';
    if (!t) { sendError(res, 401, 'Unauthorized'); return; }

    const secret = process.env.JWT_SECRET ?? '';
    let userId: string;
    try {
      const payload = jwt.verify(t, secret) as { sub?: string; id?: string };
      userId = payload.sub ?? payload.id ?? '';
    } catch {
      const oldSecret = process.env.JWT_SECRET_OLD ?? '';
      try {
        const payload = jwt.verify(t, oldSecret) as { sub?: string; id?: string };
        userId = payload.sub ?? payload.id ?? '';
      } catch {
        sendError(res, 401, 'Invalid token'); return;
      }
    }
    if (!userId) { sendError(res, 401, 'Invalid token'); return; }

    const { rows } = await pool.query(
      `SELECT file_url FROM resources WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) { sendError(res, 404, 'Not found'); return; }

    const fileUrl: string = rows[0].file_url ?? '';
    if (!fileUrl.startsWith('/uploads/')) {
      sendError(res, 400, 'No file attached'); return;
    }

    const uploadsDir = path.join(__dirname, '../../uploads');
    const filename   = fileUrl.replace('/uploads/', '');
    const filePath   = path.join(uploadsDir, filename);
    const ext        = path.extname(filename).toLowerCase();

    if (!fs.existsSync(filePath)) {
      sendError(res, 404, 'File not found on server'); return;
    }

    let pdfPath: string;

    if (OFFICE_EXTS.has(ext)) {
      // Convert to PDF via LibreOffice (cached)
      const cacheDir = path.join(uploadsDir, 'preview_cache');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      pdfPath = path.join(cacheDir, `${req.params.id}.pdf`);

      if (!fs.existsSync(pdfPath)) {
        // LibreOffice converts to outdir, filename becomes <basename>.pdf
        await execFileAsync('libreoffice', [
          '--headless', '--convert-to', 'pdf',
          '--outdir', cacheDir,
          filePath,
        ], { timeout: 60_000 });

        // Rename to stable id-based name
        const generatedName = path.join(cacheDir, path.basename(filename, ext) + '.pdf');
        if (fs.existsSync(generatedName) && generatedName !== pdfPath) {
          fs.renameSync(generatedName, pdfPath);
        }
      }
    } else {
      pdfPath = filePath; // already PDF
    }

    if (!fs.existsSync(pdfPath)) {
      sendError(res, 500, 'Conversion failed'); return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(pdfPath).pipe(res);
  } catch (e: any) {
    console.error('[preview]', e.message);
    sendError(res, 500, e.message);
  }
});

// GET /api/v1/resources/distinct-subjects?faculty=&year=  (distinct subject strings from approved resources)
router.get('/distinct-subjects', async (req: Request, res: Response) => {
  const { faculty, year, filiere } = req.query;
  const conditions: string[] = ["status = 'approved'", "subject IS NOT NULL", "subject <> ''"];
  const params: unknown[] = [];
  if (faculty) {
    const normalized = normalizeCurriculumFacultySlug(faculty, filiere);
    // Be tolerant: match both buckets and academic slugs if legacy rows exist.
    const aliases: Record<string, string[]> = {
      sciences:    ['sciences', 'una-fst'],
      medicine:    ['medicine', 'una-fm'],
      arts:        ['arts', 'una-flsh'],
      islamic:     ['islamic', 'una-fsi', 'iseri-quran', 'iseri-fiqh'],
      engineering: ['engineering', 'poly-ipgei', 'poly-numerique', 'poly-aleg', 'poly-zouerat', 'poly-energie', 'poly-statistique', 'iset-genie', 'iset-agro'],
      law:         ['law', 'una-fsje'],
      economics:   ['economics', 'una-fsje'],
    };
    params.push(aliases[normalized ?? ''] ?? [normalized]);
    conditions.push(`faculty = ANY($${params.length})`);
  }
  if (year)    { params.push(parseInt(year as string));  conditions.push(`year = $${params.length}`); }
  try {
    const result = await pool.query(
      `SELECT DISTINCT subject FROM resources WHERE ${conditions.join(' AND ')} ORDER BY subject`,
      params
    );
    res.json(result.rows.map((r: any) => r.subject as string));
  } catch (e) {
    console.error('[distinct-subjects]', e);
    sendError(res, 500, 'Server error');
  }
});

// GET /api/v1/resources/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const resource = await getResource(req.params.id);
    res.json(resource);
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

// POST /api/v1/resources/:id/download — increment counter only when file is actually opened
router.post('/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await incrementDownload(req.params.id);
    res.status(204).end();
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

// POST /api/v1/resources (authenticated)
router.post('/', authenticate, upload.single('file'), validateFileType, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.flatten()); return; }
  try {
    const resource = await createResource(req.user!.id, parsed.data, req.file);
    // Award XP for uploading a resource (fire-and-forget — don't block the response)
    awardXP(req.user!.id, 'resource_upload', 50, { resourceId: resource.id }).catch(
      (e) => console.error('[resources] XP award failed:', e)
    );
    res.status(201).json(resource);
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

// DELETE /api/v1/resources/:id (owner or admin only)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await deleteResource(req.params.id, req.user!.id, req.user!.role === 'admin');
    res.json({ deleted: true });
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

// POST /api/v1/resources/:id/like  (toggle)
router.post('/:id/like', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await toggleLike(req.user!.id, req.params.id);
    res.json(result);
  } catch (e: any) {
    console.error('[like] error:', e);
    sendError(res, e.status || 500, 'Failed to toggle like');
  }
});

// POST /api/v1/resources/:id/bookmark (toggle)
router.post('/:id/bookmark', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await toggleBookmark(req.user!.id, req.params.id);
    res.json(result);
  } catch (e: any) {
    console.error('[bookmark] error:', e);
    sendError(res, e.status || 500, 'Failed to toggle bookmark');
  }
});

// GET /api/v1/resources/subjects?faculty=&year=  (public — no auth needed, used by mobile upload screen)
router.get('/subjects', async (req: Request, res: Response) => {
  const { faculty, year, filiere } = req.query;
  const conditions = ['s.is_active = TRUE'];
  const params: unknown[] = [];

  if (faculty) {
    conditions.push(`s.faculty_slug = $${params.length + 1}`);
    params.push(normalizeCurriculumFacultySlug(faculty, filiere));
  }
  if (year)    { conditions.push(`(s.year = $${params.length + 1} OR s.year IS NULL)`); params.push(Number(year)); }

  try {
    const result = await pool.query(
      `SELECT id, name_ar, name_fr, faculty_slug, year
       FROM subjects s
       WHERE ${conditions.join(' AND ')}
       ORDER BY sort_order, name_ar`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, 'Server error');
  }
});

// ─── POST /api/v1/resources/:id/rate — community rating (upsert, 1-5 stars) ──
// Any authenticated user can rate an approved resource.
// Tapping the same star again sets score = 0 (removes the rating).
router.post('/:id/rate', authenticate, async (req: AuthRequest, res: Response) => {
  const userId     = req.user!.id;
  const resourceId = req.params.id;
  const score      = Number(req.body?.score);

  // score = 0 means "remove my rating"
  if (!Number.isInteger(score) || score < 0 || score > 5) {
    sendError(res, 400, 'score must be an integer between 0 and 5');
    return;
  }

  try {
    if (score === 0) {
      // Remove existing rating
      await pool.query(
        `DELETE FROM resource_ratings WHERE resource_id = $1 AND user_id = $2`,
        [resourceId, userId],
      );
    } else {
      // Upsert
      await pool.query(
        `INSERT INTO resource_ratings (resource_id, user_id, score, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (resource_id, user_id)
         DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()`,
        [resourceId, userId, score],
      );
    }

    // Return updated aggregate
    const { rows } = await pool.query(
      `SELECT
         ROUND(AVG(score), 1)::FLOAT AS avg_rating,
         COUNT(*)::INT                AS rating_count
       FROM resource_ratings
       WHERE resource_id = $1`,
      [resourceId],
    );

    res.json({
      my_score:     score,
      avg_rating:   rows[0].avg_rating   ?? null,
      rating_count: rows[0].rating_count ?? 0,
    });
  } catch (e: any) {
    console.error('[rate] error:', e);
    sendError(res, 500, 'Failed to save rating');
  }
});

// ─── GET /api/v1/resources/:id/my-rating — get my score + community aggregate ─
router.get('/:id/my-rating', authenticate, async (req: AuthRequest, res: Response) => {
  const userId     = req.user!.id;
  const resourceId = req.params.id;

  try {
    const [myRow, aggRow] = await Promise.all([
      pool.query(
        `SELECT score FROM resource_ratings WHERE resource_id = $1 AND user_id = $2`,
        [resourceId, userId],
      ),
      pool.query(
        `SELECT
           ROUND(AVG(score), 1)::FLOAT AS avg_rating,
           COUNT(*)::INT                AS rating_count
         FROM resource_ratings
         WHERE resource_id = $1`,
        [resourceId],
      ),
    ]);

    res.json({
      my_score:     myRow.rows[0]?.score ?? 0,
      avg_rating:   aggRow.rows[0].avg_rating   ?? null,
      rating_count: aggRow.rows[0].rating_count ?? 0,
    });
  } catch (e: any) {
    sendError(res, 500, 'Failed to fetch rating');
  }
});

// ─── POST /api/v1/resources/:id/flashcards — auto-generate a flashcard deck ──
// Idempotent: returns existing deck if already generated for this resource+user
router.post('/:id/flashcards', authenticate, async (req: AuthRequest, res: Response) => {
  const userId     = req.user!.id;
  const resourceId = req.params.id;

  try {
    // 1. Fetch the resource (must exist and be approved)
    const { rows: rRows } = await pool.query(
      `SELECT id, title, title_ar, subject, description, resource_type, year, tags
       FROM resources WHERE id = $1 AND status = 'approved'`,
      [resourceId],
    );
    if (!rRows.length) {
      sendError(res, 404, 'Resource not found or not yet approved');
      return;
    }
    const resource = rRows[0];

    // 2. Idempotency check — return existing deck if already generated
    const { rows: existing } = await pool.query(
      `SELECT d.*, COALESCE(json_agg(f ORDER BY f.created_at) FILTER (WHERE f.id IS NOT NULL), '[]') AS cards
       FROM flashcard_decks d
       LEFT JOIN flashcards f ON f.deck_id = d.id
       WHERE d.user_id = $1 AND d.resource_id = $2
       GROUP BY d.id`,
      [userId, resourceId],
    );
    if (existing.length) {
      res.json({ deck: existing[0], already_existed: true });
      return;
    }

    // 3. Generate cards from resource metadata
    const cards = generateCardsFromResource(resource);

    // 4. Create deck (resource_id links back for idempotency)
    const deckTitle = resource.title.length > 80
      ? resource.title.slice(0, 77) + '…'
      : resource.title;

    const { rows: deckRows } = await pool.query(
      `INSERT INTO flashcard_decks (user_id, title, subject, color, resource_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, deckTitle, resource.subject, pickColor(resource.resource_type), resourceId],
    );
    const deck = deckRows[0];

    // 5. Bulk insert cards
    if (cards.length) {
      const valuePlaceholders = cards
        .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`)
        .join(', ');
      const flatValues: unknown[] = [deck.id];
      for (const c of cards) flatValues.push(c.front, c.back);

      await pool.query(
        `INSERT INTO flashcards (deck_id, front, back) VALUES ${valuePlaceholders}`,
        flatValues,
      );
    }

    // 6. Sync card_count
    await pool.query(
      `UPDATE flashcard_decks SET card_count = $1 WHERE id = $2`,
      [cards.length, deck.id],
    );

    // 7. Return deck with cards
    const { rows: finalCards } = await pool.query(
      `SELECT * FROM flashcards WHERE deck_id = $1 ORDER BY created_at ASC`,
      [deck.id],
    );

    res.status(201).json({
      deck: { ...deck, card_count: cards.length },
      cards: finalCards,
      already_existed: false,
    });
  } catch (e: any) {
    console.error('[flashcards-auto] error:', e);
    sendError(res, 500, 'Failed to generate flashcards');
  }
});

// ─── Helpers for auto-generation ─────────────────────────────────────────────

type ResourceRow = {
  title: string;
  title_ar: string | null;
  subject: string;
  description: string | null;
  resource_type: string;
  year: number;
  tags: string[];
};

function pickColor(resourceType: string): string {
  const map: Record<string, string> = {
    note:          '#8B5CF6',
    summary:       '#0EA5E9',
    past_exam:     '#EF4444',
    exercise:      '#F97316',
    project:       '#10B981',
    presentation:  '#3B82F6',
    video_course:  '#EC4899',
  };
  return map[resourceType] ?? '#8B5CF6';
}

function generateCardsFromResource(r: ResourceRow): { front: string; back: string }[] {
  const cards: { front: string; back: string }[] = [];
  const typeLabels: Record<string, string> = {
    note: 'cours', summary: 'résumé', past_exam: 'examen corrigé',
    exercise: 'TD', project: 'projet', presentation: 'présentation', video_course: 'cours vidéo',
  };
  const typeLabel = typeLabels[r.resource_type] ?? r.resource_type;
  const yearSuffix = r.year ? ` (${r.year}ème année)` : '';

  // Card 1 — Overview / what is this document
  cards.push({
    front: `De quoi traite ce ${typeLabel} sur "${r.subject}"${yearSuffix} ?`,
    back:  r.description?.trim() ||
           `Ce document porte sur la matière "${r.subject}" et constitue un ${typeLabel} de référence.`,
  });

  // Card 2 — Resource type learning strategy
  const strategyMap: Record<string, string> = {
    note:         'Lire activement, résumer chaque section en 3 points clés, puis fermer le cours et reproduire de mémoire.',
    summary:      'Lire une fois en entier, identifier les concepts principaux, puis réviser en spaced-repetition (cette app !)',
    past_exam:    'Analyser chaque question : comprendre ce qui est demandé, rédiger une réponse sans regarder la correction, puis comparer.',
    exercise:     'Résoudre les exercices sans consulter le corrigé. Revenir sur les erreurs et comprendre chaque étape.',
    project:      'Identifier la problématique centrale, les méthodologies utilisées et les conclusions principales.',
    presentation: 'Extraire les idées-clés de chaque slide. Reformuler chaque idée dans tes propres mots.',
    video_course: 'Regarder sans pause, noter les concepts flous. Revoir uniquement les passages difficiles.',
  };
  cards.push({
    front: `Quelle est la meilleure stratégie pour apprendre à partir d'un ${typeLabel} ?`,
    back:  strategyMap[r.resource_type] ?? 'Lire attentivement, prendre des notes, et réviser régulièrement.',
  });

  // Cards from tags — one definition card per tag (max 6)
  const tags = (r.tags ?? []).slice(0, 6);
  for (const tag of tags) {
    if (tag.length < 3) continue;
    cards.push({
      front: `Qu'est-ce que « ${tag} » dans le contexte de ${r.subject} ?`,
      back:  `Concept clé en ${r.subject} : "${tag}". Retrouve la définition complète dans le document "${r.title}".`,
    });
  }

  // Card — Arabic title (bilingual learners)
  if (r.title_ar && r.title_ar !== r.title) {
    cards.push({
      front: `ما هو الاسم العربي لهذه المادة / هذا المستند؟`,
      back:  `${r.title_ar}  ·  ${r.title}`,
    });
  }

  // Type-specific extra cards
  if (r.resource_type === 'past_exam') {
    cards.push({
      front: `Quels types de questions reviennent souvent dans les examens de ${r.subject}${yearSuffix} ?`,
      back:  `Analyse ce document pour identifier les thèmes récurrents. Note les formulations des questions pour anticiper le prochain examen.`,
    });
    cards.push({
      front: `Comment structurer une réponse parfaite à l'examen de ${r.subject} ?`,
      back:  `1. Lire l'intégralité du sujet avant de commencer.\n2. Commencer par les questions maîtrisées.\n3. Structurer chaque réponse : introduction → développement → conclusion.\n4. Laisser du temps pour relire.`,
    });
  }
  if (r.resource_type === 'note' || r.resource_type === 'summary') {
    cards.push({
      front: `Quels sont les 3 points les plus importants à retenir sur ${r.subject} ?`,
      back:  `Après lecture du document, identifie et écris ici tes 3 points clés. (Crée tes propres cartes pour personnaliser ta révision !)`,
    });
  }
  if (r.resource_type === 'exercise') {
    cards.push({
      front: `Quelle est la formule / méthode principale utilisée dans ce TD de ${r.subject} ?`,
      back:  `Revois le document pour extraire la méthode de résolution principale. Note les étapes clés ici.`,
    });
  }

  return cards;
}

export default router;

