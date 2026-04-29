import { Router, Response } from 'express';
import path from 'path';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { scrapeFstStudentData, getYearFromProfile } from '../services/fstScraper';
import { invalidateResourcesCache } from '../services/resourceService';
import { startBulkScrape, stopBulkScrape, getBulkStatus } from '../services/fstBulkScraper';
import { awardBonusDay } from '../services/subscriptionService';
import { activateSubscriptionForUser, getMySubscriptionSnapshot } from '../services/entitlements/subscriptionManagementService';
import { getUsageSnapshot } from '../services/entitlements/usageCounterService';
import { startDriveImport, getJob, listJobs } from '../services/driveImportService';
import { sendError } from '../utils/httpError';

const router = Router();
router.use(authenticate);
router.use(requireRole('admin', 'moderator'));

// POST /api/v1/admin/import/fst
router.post('/import/fst', async (req: AuthRequest, res: Response) => {
  const studentNumber = String(req.body?.studentNumber || '').trim().toUpperCase();
  const phone = String(req.body?.phone || '').trim();
  if (!/^C\d{5}$/i.test(studentNumber)) {
    sendError(res, 400, 'studentNumber must match C12345 format');
    return;
  }

  const scraped = await scrapeFstStudentData(studentNumber);
  const year = getYearFromProfile(scraped.profile);

  let inserted = 0;
  let skipped = 0;

  for (const course of scraped.courses) {
    const fileUrl = `http://resultats.una.mr/FST/#${studentNumber}-${course.code}`;
    const existing = await pool.query('SELECT id FROM resources WHERE file_url = $1 LIMIT 1', [fileUrl]);
    if (existing.rows.length) {
      skipped += 1;
      continue;
    }

    await pool.query(
      `INSERT INTO resources
        (title, title_ar, description, resource_type, faculty, university, subject, year,
         file_url, file_name, file_type, uploaded_by, status, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'approved',$13)`,
      [
        course.title,
        course.title,
        `Imported from UNA FST portal for ${scraped.studentName} (${studentNumber})${phone ? `, phone: ${phone}` : ''}`,
        'summary',
        'sciences',
        'una',
        course.title,
        year,
        fileUrl,
        `${course.code}.txt`,
        'txt',
        req.user!.id,
        ['fst', 'una', 'imported'],
      ]
    );
    inserted += 1;
  }

  res.json({
    student: {
      studentNumber: scraped.studentNumber,
      studentName: scraped.studentName,
      profile: scraped.profile,
    },
    totals: {
      scrapedCourses: scraped.courses.length,
      inserted,
      skipped,
    },
  });
});

// POST /api/v1/admin/resources/upload  — admin uploads a PDF directly (auto-approved)
router.post('/resources/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) { sendError(res, 400, 'No file uploaded'); return; }

  const title       = String(req.body?.title || '').trim();
  const titleAr     = String(req.body?.titleAr || req.body?.title_ar || '').trim();
  const subject     = String(req.body?.subject || '').trim();
  const description = String(req.body?.description || '').trim();
  const resourceType = String(req.body?.resourceType || req.body?.resource_type || 'summary').trim();
  const faculty     = String(req.body?.faculty || 'sciences').trim();
  const university  = String(req.body?.university || 'una').trim();
  const year        = parseInt(req.body?.year || '1', 10);
  const tags        = req.body?.tags ? JSON.parse(req.body.tags) : [];

  if (!title || !subject) {
    sendError(res, 400, 'title and subject are required');
    return;
  }

  const fileUrl  = `/uploads/${file.filename}`;
  const fileName = file.originalname;
  const fileSize = file.size;
  const fileType = path.extname(file.originalname).slice(1).toLowerCase();

  const { rows } = await pool.query(
    `INSERT INTO resources
       (title, title_ar, description, resource_type, faculty, university, subject, year,
        file_url, file_name, file_size, file_type, uploaded_by, status, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'approved',$14)
     RETURNING *`,
    [title, titleAr || title, description, resourceType, faculty, university,
     subject, year, fileUrl, fileName, fileSize, fileType, req.user!.id, tags]
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/v1/admin/resources/:id
router.delete('/resources/:id', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    'DELETE FROM resources WHERE id = $1 RETURNING id, file_url',
    [req.params.id]
  );
  if (!rows.length) { sendError(res, 404, 'Not found'); return; }
  // Delete physical file if it exists
  if (rows[0].file_url?.startsWith('/uploads/')) {
    const fs = require('fs');
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', path.basename(rows[0].file_url));
    fs.unlink(filePath, () => {});
  }
  res.json({ deleted: rows[0].id });
});

// POST /api/v1/admin/import/gdrive-batch  — bulk-import resources from Google Drive
router.post('/import/gdrive-batch', async (req: AuthRequest, res: Response) => {
  const items: Array<{
    title: string;
    subject: string;
    year: number;
    faculty?: string;
    university?: string;
    specialization?: string;
    semester?: string;
    resource_type?: string;
    file_url: string;
    file_name?: string;
    description?: string;
    tags?: string[];
  }> = Array.isArray(req.body?.resources) ? req.body.resources : [];

  // Top-level defaults (can be overridden per item)
  const defaultFaculty    = String(req.body?.faculty    || 'sciences').trim();
  const defaultUniversity = String(req.body?.university || 'una').trim();

  if (!items.length) {
    sendError(res, 400, 'resources array is required and must not be empty');
    return;
  }

  const VALID_TYPES = ['note', 'past_exam', 'summary', 'exercise', 'project', 'presentation'];

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      if (!item.title || !item.subject || !item.file_url) {
        errors.push(`Skipping item missing required fields: ${JSON.stringify(item).slice(0, 80)}`);
        skipped++;
        continue;
      }

      const resourceType = VALID_TYPES.includes(item.resource_type || '') ? item.resource_type : 'note';
      const year = Number.isInteger(item.year) && item.year >= 1 && item.year <= 7 ? item.year : 1;
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const faculty    = String(item.faculty    || defaultFaculty).trim();
      const university = String(item.university || defaultUniversity).trim();

      // Skip duplicates based on file_url
      const existing = await pool.query('SELECT id FROM resources WHERE file_url = $1 LIMIT 1', [item.file_url]);
      if (existing.rows.length) {
        skipped++;
        continue;
      }

      const fileName = item.file_name || item.title;
      const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf';
      const desc = item.description ||
        `Importé depuis Google Drive – ${item.subject}${item.specialization ? ` (${item.specialization})` : ''}${item.semester ? `, ${item.semester}` : ''}`;

      await pool.query(
        `INSERT INTO resources
           (title, title_ar, description, resource_type, faculty, university, subject, year,
            file_url, file_name, file_type, uploaded_by, status, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'approved',$13)`,
        [
          item.title,
          item.title,
          desc,
          resourceType,
          faculty,
          university,
          item.subject,
          year,
          item.file_url,
          fileName,
          ext,
          req.user!.id,
          tags,
        ]
      );
      inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error on "${item.title}": ${msg}`);
      skipped++;
    }
  }

  res.json({ inserted, skipped, errors: errors.slice(0, 20) });
});

// ── Drive Auto-Import (lancer depuis l'admin panel) ──────────────────────────
// POST /api/v1/admin/import/drive
router.post('/import/drive', async (req: AuthRequest, res: Response) => {
  const { driveUrl, faculty, year, university } = req.body || {};
  if (!driveUrl || !faculty || !year) {
    sendError(res, 400, 'driveUrl, faculty et year sont requis');
    return;
  }

  // Get admin token from current request to pass to Python script
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  const apiBase = `http://localhost:${process.env.PORT || 3000}/api/v1`;
  const jobId = startDriveImport(
    String(driveUrl),
    String(faculty),
    Number(year),
    String(university || 'Université de Mauritanie'),
    token,
    apiBase
  );

  res.json({ jobId, message: 'Import démarré en arrière-plan' });
});

// GET /api/v1/admin/import/drive/:jobId
router.get('/import/drive/:jobId', (req: AuthRequest, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    sendError(res, 404, 'Job introuvable');
    return;
  }
  res.json(job);
});

// GET /api/v1/admin/import/drive
router.get('/import/drive', (_req: AuthRequest, res: Response) => {
  res.json(listJobs());
});

// ── Bulk FST scrape ──────────────────────────────────────────────────────────
// GET /api/v1/admin/bulk-scrape/status
router.get('/bulk-scrape/status', (_req: AuthRequest, res: Response) => {
  res.json(getBulkStatus());
});

// POST /api/v1/admin/bulk-scrape/start
router.post('/bulk-scrape/start', (req: AuthRequest, res: Response) => {
  const startNum = parseInt(String(req.body?.startNum ?? '29000'), 10);
  const endNum   = parseInt(String(req.body?.endNum   ?? '35000'), 10);
  if (isNaN(startNum) || isNaN(endNum) || startNum < 20000 || endNum > 99999 || startNum >= endNum) {
    sendError(res, 400, 'startNum/endNum invalides (nombres entre 20000 et 99999)');
    return;
  }
  if (endNum - startNum > 20000) {
    sendError(res, 400, 'Plage trop grande (max 20 000)');
    return;
  }
  startBulkScrape(startNum, endNum, req.user!.id);
  res.json({ message: 'Démarré', status: getBulkStatus() });
});

// POST /api/v1/admin/bulk-scrape/stop
router.post('/bulk-scrape/stop', (_req: AuthRequest, res: Response) => {
  stopBulkScrape();
  res.json({ message: 'Signal d\'arrêt envoyé', status: getBulkStatus() });
});

// GET /api/v1/admin/stats
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  const [users, resources, pending, reminders] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM users'),
    pool.query("SELECT COUNT(*) FROM resources WHERE status = 'approved'"),
    pool.query("SELECT COUNT(*) FROM resources WHERE status = 'pending'"),
    pool.query('SELECT COUNT(*) FROM reminders'),
  ]);
  res.json({
    totalUsers:       parseInt(users.rows[0].count),
    totalResources:   parseInt(resources.rows[0].count),
    pendingModeration: parseInt(pending.rows[0].count),
    totalReminders:   parseInt(reminders.rows[0].count),
  });
});

// GET /api/v1/admin/analytics
router.get('/analytics', async (_req: AuthRequest, res: Response) => {
  const [
    newUsersJ7,
    newUsersJ30,
    topResources,
    facultyBreakdown,
    uploadsByDay,
    activeUsers7d,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days'`),
    pool.query(`
      SELECT title_ar AS title, faculty, downloads, likes, resource_type
      FROM resources WHERE status = 'approved'
      ORDER BY downloads DESC LIMIT 10`),
    pool.query(`
      SELECT faculty, COUNT(*) AS count
      FROM resources WHERE status = 'approved'
      GROUP BY faculty ORDER BY count DESC`),
    pool.query(`
      SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*) AS uploads
      FROM resources
      WHERE created_at >= NOW() - INTERVAL '14 days' AND status != 'rejected'
      GROUP BY day ORDER BY day`),
    pool.query(`
      SELECT COUNT(DISTINCT uploaded_by) AS count
      FROM resources
      WHERE created_at >= NOW() - INTERVAL '7 days'`),
  ]);

  res.json({
    newUsersJ7:       parseInt(newUsersJ7.rows[0].count),
    newUsersJ30:      parseInt(newUsersJ30.rows[0].count),
    activeUploaders7d: parseInt(activeUsers7d.rows[0].count),
    topResources:     topResources.rows,
    facultyBreakdown: facultyBreakdown.rows,
    uploadsByDay:     uploadsByDay.rows,
  });
});

// GET /api/v1/admin/resources  (all, with filters)
router.get('/resources', async (req: AuthRequest, res: Response) => {
  const { status = 'pending', page = '1', limit = '20' } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows } = await pool.query(
    `SELECT r.*,
            u.full_name AS uploader_name, u.email AS uploader_email,
            ROUND(AVG(rr.score), 1)::FLOAT AS avg_rating,
            COUNT(rr.id)::INT              AS rating_count
     FROM resources r
     JOIN users u ON r.uploaded_by = u.id
     LEFT JOIN resource_ratings rr ON rr.resource_id = r.id
     WHERE r.status = $1
     GROUP BY r.id, u.full_name, u.email
     ORDER BY r.created_at ASC
     LIMIT $2 OFFSET $3`,
    [status, parseInt(limit), offset]
  );
  const count = await pool.query(`SELECT COUNT(*) FROM resources WHERE status = $1`, [status]);
  res.json({ data: rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
});

// PUT /api/v1/admin/resources/:id/moderate
router.put('/resources/:id/moderate', async (req: AuthRequest, res: Response) => {
  const { action, reason } = req.body as { action: 'approve' | 'reject'; reason?: string };
  if (!['approve', 'reject'].includes(action)) {
    sendError(res, 400, 'action must be "approve" or "reject"');
    return;
  }
  const status = action === 'approve' ? 'approved' : 'rejected';
  const { rows } = await pool.query(
    `UPDATE resources
     SET status = $1, rejection_reason = $2, moderated_by = $3, moderated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [status, reason || null, req.user!.id, req.params.id]
  );
  if (!rows.length) { sendError(res, 404, 'Resource not found'); return; }
  invalidateResourcesCache();

  await pool.query(
    `INSERT INTO moderation_logs (resource_id, moderator_id, action, reason) VALUES ($1, $2, $3, $4)`,
    [req.params.id, req.user!.id, action, reason || null]
  );

  // Award +1 bonus subscription day to the uploader when their file is approved
  if (action === 'approve' && rows[0]?.uploaded_by) {
    awardBonusDay(rows[0].uploaded_by).catch(
      (e) => console.error('[billing] awardBonusDay failed:', e)
    );
  }

  res.json(rows[0]);
});

// GET /api/v1/admin/users
router.get('/users', async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '20', q } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params: unknown[] = [];
  let where = '';
  if (q) { params.push(`%${q}%`); where = `WHERE u.full_name ILIKE $1 OR u.email ILIKE $1`; }
  params.push(parseInt(limit), offset);

  const { rows } = await pool.query(
    `SELECT id, email, full_name, university, faculty, year, role, is_verified, is_banned, is_approved,
            total_uploads, total_downloads, created_at
     FROM users u ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

// GET /api/v1/admin/users/pending — users awaiting approval
router.get('/users/pending', async (_req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, email, full_name, university, faculty, year, role, created_at
     FROM users
     WHERE is_approved = FALSE AND is_banned = FALSE
     ORDER BY created_at ASC`
  );
  res.json(rows);
});

// PUT /api/v1/admin/users/:id/approve
router.put('/users/:id/approve', async (req: AuthRequest, res: Response) => {
  await pool.query('UPDATE users SET is_approved = TRUE WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// PUT /api/v1/admin/users/:id/ban
router.put('/users/:id/ban', async (req: AuthRequest, res: Response) => {
  const { banned } = req.body as { banned: boolean };
  await pool.query('UPDATE users SET is_banned = $1 WHERE id = $2', [banned, req.params.id]);
  res.json({ success: true, banned });
});

// PUT /api/v1/admin/users/:id/verify
router.put('/users/:id/verify', async (req: AuthRequest, res: Response) => {
  await pool.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ─── Badge admin endpoints ─────────────────────────────────────────────────────

// GET /api/v1/admin/badges
router.get('/badges', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await pool.query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM user_badges ub WHERE ub.badge_id = b.id)::int AS earned_count
       FROM badges b
       ORDER BY b.created_at DESC`
    );
    res.json(rows.rows);
  } catch (err) {
    console.error('[admin/badges]', err);
    sendError(res, 500, 'Server error');
  }
});

// POST /api/v1/admin/badges
router.post('/badges', async (req: AuthRequest, res: Response) => {
  const { slug, name_fr, name_ar, emoji = '🏅', color = '#F59E0B',
    condition_type, threshold = 1, xp_reward = 50, description_fr } = req.body;
  if (!slug || !name_fr || !name_ar || !condition_type) {
    sendError(res, 400, 'slug, name_fr, name_ar, condition_type required');
    return;
  }
  try {
    const row = await pool.query(
      `INSERT INTO badges (slug, name_fr, name_ar, emoji, color, condition_type, threshold, xp_reward, description_fr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [slug, name_fr, name_ar, emoji, color, condition_type, threshold, xp_reward, description_fr || null]
    );
    res.status(201).json(row.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { sendError(res, 409, 'slug already exists'); return; }
    console.error('[admin/badges/post]', err);
    sendError(res, 500, 'Server error');
  }
});

// PUT /api/v1/admin/badges/:id — toggle active or update
router.put('/badges/:id', async (req: AuthRequest, res: Response) => {
  const { is_active } = req.body as { is_active: boolean };
  try {
    await pool.query('UPDATE badges SET is_active = $1 WHERE id = $2', [is_active, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/badges/put]', err);
    sendError(res, 500, 'Server error');
  }
});

// DELETE /api/v1/admin/badges/:id
router.delete('/badges/:id', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM badges WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/badges/delete]', err);
    sendError(res, 500, 'Server error');
  }
});

// ── Filières (Faculties) ─────────────────────────────────────────────────────

// GET /api/v1/admin/faculties
router.get('/faculties', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await pool.query('SELECT * FROM faculties ORDER BY sort_order, name_fr');
    res.json(rows.rows);
  } catch (err) {
    console.error('[admin/faculties]', err);
    sendError(res, 500, 'Server error');
  }
});

// POST /api/v1/admin/faculties
router.post('/faculties', async (req: AuthRequest, res: Response) => {
  const { slug, name_fr, name_ar, icon = '🎓', sort_order = 0 } = req.body;
  if (!slug || !name_fr || !name_ar) {
    sendError(res, 400, 'slug, name_fr et name_ar requis');
    return;
  }
  try {
    const row = await pool.query(
      'INSERT INTO faculties (slug, name_fr, name_ar, icon, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [slug.toLowerCase().replace(/\s+/g, '_'), name_fr, name_ar, icon, sort_order]
    );
    res.status(201).json(row.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { sendError(res, 409, 'Slug déjà utilisé'); return; }
    console.error('[admin/faculties/post]', err);
    sendError(res, 500, 'Server error');
  }
});

// PUT /api/v1/admin/faculties/:id
router.put('/faculties/:id', async (req: AuthRequest, res: Response) => {
  const { name_fr, name_ar, icon, is_active, sort_order } = req.body;
  try {
    await pool.query(
      `UPDATE faculties SET
        name_fr    = COALESCE($1, name_fr),
        name_ar    = COALESCE($2, name_ar),
        icon       = COALESCE($3, icon),
        is_active  = COALESCE($4, is_active),
        sort_order = COALESCE($5, sort_order)
       WHERE id = $6`,
      [name_fr ?? null, name_ar ?? null, icon ?? null, is_active ?? null, sort_order ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/faculties/put]', err);
    sendError(res, 500, 'Server error');
  }
});

// DELETE /api/v1/admin/faculties/:id
router.delete('/faculties/:id', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM faculties WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/faculties/delete]', err);
    sendError(res, 500, 'Server error');
  }
});

// ── Matières (Subjects) ──────────────────────────────────────────────────────

// GET /api/v1/admin/subjects?faculty=&year=
router.get('/subjects', async (req: AuthRequest, res: Response) => {
  const { faculty, year } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (faculty) { conditions.push(`s.faculty_slug = $${params.length + 1}`); params.push(faculty); }
  if (year)    { conditions.push(`s.year = $${params.length + 1}`);          params.push(Number(year)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const rows = await pool.query(
      `SELECT s.*, f.name_fr AS faculty_name_fr, f.name_ar AS faculty_name_ar, f.icon AS faculty_icon
       FROM subjects s
       JOIN faculties f ON f.slug = s.faculty_slug
       ${where}
       ORDER BY s.faculty_slug, s.year NULLS LAST, s.sort_order, s.name_ar`,
      params
    );
    res.json(rows.rows);
  } catch (err) {
    console.error('[admin/subjects]', err);
    sendError(res, 500, 'Server error');
  }
});

// POST /api/v1/admin/subjects
router.post('/subjects', async (req: AuthRequest, res: Response) => {
  const { name_ar, name_fr, faculty_slug, year, sort_order = 0 } = req.body;
  if (!name_ar || !faculty_slug) {
    sendError(res, 400, 'name_ar et faculty_slug requis');
    return;
  }
  try {
    const row = await pool.query(
      `INSERT INTO subjects (name_ar, name_fr, faculty_slug, year, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name_ar.trim(), name_fr?.trim() || null, faculty_slug, year ? Number(year) : null, sort_order]
    );
    res.status(201).json(row.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { sendError(res, 409, 'Matière déjà existante pour cette filière/année'); return; }
    console.error('[admin/subjects/post]', err);
    sendError(res, 500, 'Server error');
  }
});

// PUT /api/v1/admin/subjects/:id
router.put('/subjects/:id', async (req: AuthRequest, res: Response) => {
  const { name_ar, name_fr, year, is_active, sort_order } = req.body;
  try {
    await pool.query(
      `UPDATE subjects SET
        name_ar    = COALESCE($1, name_ar),
        name_fr    = COALESCE($2, name_fr),
        year       = $3,
        is_active  = COALESCE($4, is_active),
        sort_order = COALESCE($5, sort_order)
       WHERE id = $6`,
      [name_ar ?? null, name_fr ?? null, year ? Number(year) : null, is_active ?? null, sort_order ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/subjects/put]', err);
    sendError(res, 500, 'Server error');
  }
});

// DELETE /api/v1/admin/subjects/:id
router.delete('/subjects/:id', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/subjects/delete]', err);
    sendError(res, 500, 'Server error');
  }
});

// ─── Daily Challenge Sets (admin-authored) ────────────────────────────────────

// GET /api/v1/admin/daily-challenges — list all, newest first
router.get('/daily-challenges', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT dcs.id, dcs.challenge_date, dcs.faculty, dcs.show_from_hour, dcs.show_from_minute,
              dcs.time_limit_s, dcs.questions, dcs.is_active,
              dcs.created_at, dcs.updated_at, u.full_name AS created_by_name
       FROM daily_challenge_sets dcs
       LEFT JOIN users u ON u.id = dcs.created_by
       ORDER BY dcs.challenge_date DESC, dcs.faculty`,
    );
    res.json(rows);
  } catch (err) {
    console.error('[admin/daily-challenges/get]', err);
    sendError(res, 500, 'Server error');
  }
});

// POST /api/v1/admin/daily-challenges
router.post('/daily-challenges', async (req: AuthRequest, res: Response) => {
  const { challenge_date, faculty = 'all', show_from_hour = 0, show_from_minute = 0, time_limit_s = 60, questions, is_active = true } = req.body;
  if (!challenge_date || !Array.isArray(questions) || questions.length < 1) {
    sendError(res, 400, 'challenge_date and questions[] are required');
    return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO daily_challenge_sets
         (challenge_date, faculty, show_from_hour, show_from_minute, time_limit_s, questions, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (challenge_date, faculty)
       DO UPDATE SET
         questions        = EXCLUDED.questions,
         show_from_hour   = EXCLUDED.show_from_hour,
         show_from_minute = EXCLUDED.show_from_minute,
         time_limit_s     = EXCLUDED.time_limit_s,
         is_active        = EXCLUDED.is_active,
         updated_at       = NOW()
       RETURNING *`,
      [challenge_date, faculty, show_from_hour, show_from_minute, time_limit_s, JSON.stringify(questions), is_active, req.user!.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[admin/daily-challenges/post]', err);
    sendError(res, 500, 'Server error');
  }
});

// PUT /api/v1/admin/daily-challenges/:id
router.put('/daily-challenges/:id', async (req: AuthRequest, res: Response) => {
  const { challenge_date, faculty, show_from_hour, show_from_minute, time_limit_s, questions, is_active } = req.body;
  try {
    await pool.query(
      `UPDATE daily_challenge_sets SET
         challenge_date   = COALESCE($1, challenge_date),
         faculty          = COALESCE($2, faculty),
         show_from_hour   = COALESCE($3, show_from_hour),
         show_from_minute = COALESCE($4, show_from_minute),
         time_limit_s     = COALESCE($5, time_limit_s),
         questions        = COALESCE($6, questions),
         is_active        = COALESCE($7, is_active),
         updated_at       = NOW()
       WHERE id = $8`,
      [
        challenge_date ?? null,
        faculty ?? null,
        show_from_hour ?? null,
        show_from_minute ?? null,
        time_limit_s ?? null,
        questions ? JSON.stringify(questions) : null,
        is_active ?? null,
        req.params.id,
      ],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/daily-challenges/put]', err);
    sendError(res, 500, 'Server error');
  }
});

// DELETE /api/v1/admin/daily-challenges/:id
router.delete('/daily-challenges/:id', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM daily_challenge_sets WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/daily-challenges/delete]', err);
    sendError(res, 500, 'Server error');
  }
});

// ── Password Reset Requests ───────────────────────────────────────────────────

// GET /api/v1/admin/password-resets
router.get('/password-resets', async (_req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT prr.id, prr.created_at, prr.status,
            u.id AS user_id, u.email, u.full_name
     FROM password_reset_requests prr
     JOIN users u ON u.id = prr.user_id
     WHERE prr.status = 'pending'
     ORDER BY prr.created_at DESC`
  );
  res.json(rows);
});

// PUT /api/v1/admin/password-resets/:id/approve
router.put('/password-resets/:id/approve', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE password_reset_requests SET status = 'approved'
     WHERE id = $1 AND status = 'pending'
     RETURNING user_id, new_password_hash`,
    [id]
  );
  if (!rows.length) { sendError(res, 404, 'Request not found or already processed'); return; }
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [rows[0].new_password_hash, rows[0].user_id]);
  res.json({ success: true });
});

// PUT /api/v1/admin/password-resets/:id/reject
router.put('/password-resets/:id/reject', async (req: AuthRequest, res: Response) => {
  await pool.query("UPDATE password_reset_requests SET status = 'rejected' WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

// ── Faculty Change Requests ─────────────────────────────────────────────────

// GET /api/v1/admin/faculty-change-requests?status=pending
router.get('/faculty-change-requests', async (req: AuthRequest, res: Response) => {
  const status = (req.query.status as string) || 'pending';
  const { rows } = await pool.query(
    `SELECT fcr.id, fcr.user_id, fcr.new_faculty, fcr.new_university, fcr.new_filiere, fcr.new_year,
            fcr.status, fcr.admin_note, fcr.created_at,
            u.email, u.full_name,
            u.faculty    AS current_faculty,
            u.university AS current_university,
            u.filiere    AS current_filiere,
            u.year       AS current_year
       FROM faculty_change_requests fcr
       JOIN users u ON u.id = fcr.user_id
      WHERE fcr.status = $1
      ORDER BY fcr.created_at DESC`,
    [status],
  );
  res.json(rows);
});

// PUT /api/v1/admin/faculty-change-requests/:id/approve
router.put('/faculty-change-requests/:id/approve', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE faculty_change_requests SET status = 'approved', resolved_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING user_id, new_faculty, new_university, new_filiere, new_year`,
    [id],
  );
  if (!rows.length) { sendError(res, 404, 'Not found or already processed'); return; }
  const { user_id, new_faculty, new_university, new_filiere, new_year } = rows[0];
  const setClauses: string[] = [];
  const vals: unknown[] = [user_id];
  if (new_faculty)    { setClauses.push(`faculty = $${vals.push(new_faculty)}`); }
  if (new_university) { setClauses.push(`university = $${vals.push(new_university)}`); }
  if (new_filiere !== undefined && new_filiere !== null) { setClauses.push(`filiere = $${vals.push(new_filiere)}`); }
  if (new_year != null) { setClauses.push(`year = $${vals.push(new_year)}`); }
  if (setClauses.length) {
    await pool.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $1`, vals);
  }
  res.json({ success: true });
});

// PUT /api/v1/admin/faculty-change-requests/:id/reject
router.put('/faculty-change-requests/:id/reject', async (req: AuthRequest, res: Response) => {
  const { admin_note } = req.body as { admin_note?: string };
  await pool.query(
    `UPDATE faculty_change_requests SET status = 'rejected', resolved_at = NOW(), admin_note = $2
      WHERE id = $1`,
    [req.params.id, admin_note ?? null],
  );
  res.json({ success: true });
});

// ─── AI Chat Model Configuration ─────────────────────────────────────────────

/**
 * GET /admin/ai/model-config
 * Returns current config for all AI chat models.
 */
router.get('/ai/model-config', async (_req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT model_id, display_name, credit_cost, max_context_messages, max_output_tokens, daily_quota, is_enabled, updated_at
     FROM ai_chat_model_config ORDER BY model_id`,
  );
  res.json(rows);
});

/**
 * PUT /admin/ai/model-config/:modelId
 * Body: { credit_cost?, max_context_messages?, max_output_tokens?, daily_quota?, is_enabled?, display_name? }
 */
router.put('/ai/model-config/:modelId', async (req: AuthRequest, res: Response) => {
  const { modelId } = req.params;
  const allowed = ['ara', 'deepseek', 'gpt'];
  if (!allowed.includes(modelId)) { sendError(res, 400, 'modelId invalide'); return; }

  const fields: Record<string, any> = {};
  const permitted = ['credit_cost', 'max_context_messages', 'max_output_tokens', 'daily_quota', 'is_enabled', 'display_name'];
  for (const key of permitted) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }
  if (!Object.keys(fields).length) { sendError(res, 400, 'Aucun champ à modifier'); return; }

  const setClauses = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [modelId, ...Object.values(fields)];

  await pool.query(
    `UPDATE ai_chat_model_config SET ${setClauses}, updated_at = NOW() WHERE model_id = $1`,
    values,
  );

  const { rows } = await pool.query(
    `SELECT * FROM ai_chat_model_config WHERE model_id = $1`,
    [modelId],
  );
  res.json({ success: true, model: rows[0] });
});

// ─── Subscription management ──────────────────────────────────────────────────

/**
 * GET /admin/users/:id/subscription
 * Returns the current subscription info for a user.
 */
router.get('/users/:id/subscription', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT u.full_name, u.email,
            s.trial_ends_at, s.paid_until, s.effective_until,
            s.bonus_days, s.accepted_uploads_count,
            CASE
              WHEN s.effective_until > NOW() AND s.paid_until IS NOT NULL THEN 'active'
              WHEN s.effective_until > NOW() THEN 'trial'
              ELSE 'expired'
            END AS status
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1`,
    [id],
  );
  if (!rows.length) { sendError(res, 404, 'Utilisateur introuvable'); return; }
  res.json(rows[0]);
});

/**
 * PUT /admin/users/:id/subscription
 * Body: { duration_days: number, plan: string, note?: string }
 * Sets paid_until = NOW() + duration_days (extends from today, not from current expiry).
 * Also logs the action.
 */
router.put('/users/:id/subscription', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { duration_days, plan, note } = req.body as { duration_days: number; plan: string; note?: string };

  if (!duration_days || duration_days < 1 || duration_days > 3650) {
    sendError(res, 400, 'duration_days doit être entre 1 et 3650');
    return;
  }
  if (!plan) { sendError(res, 400, 'plan requis'); return; }

  // Check user exists
  const { rows: userRows } = await pool.query('SELECT id, full_name, email FROM users WHERE id = $1', [id]);
  if (!userRows.length) { sendError(res, 404, 'Utilisateur introuvable'); return; }

  // Upsert subscription: set paid_until = NOW() + duration_days
  await pool.query(
    `INSERT INTO subscriptions (user_id, trial_ends_at, paid_until, effective_until)
     VALUES ($1,
             NOW() + INTERVAL '7 days',
             NOW() + ($2 || ' days')::INTERVAL,
             NOW() + ($2 || ' days')::INTERVAL)
     ON CONFLICT (user_id) DO UPDATE
       SET paid_until      = NOW() + ($2 || ' days')::INTERVAL,
           effective_until = GREATEST(subscriptions.effective_until, NOW() + ($2 || ' days')::INTERVAL)`,
    [id, duration_days],
  );

  // Re-fetch updated info
  const { rows } = await pool.query(
    `SELECT s.paid_until, s.effective_until,
            CASE
              WHEN s.effective_until > NOW() AND s.paid_until IS NOT NULL THEN 'active'
              WHEN s.effective_until > NOW() THEN 'trial'
              ELSE 'expired'
            END AS status
     FROM subscriptions s WHERE s.user_id = $1`,
    [id],
  );

  res.json({
    success: true,
    user: userRows[0],
    plan,
    duration_days,
    note: note ?? null,
    subscription: rows[0],
    granted_by: (req as any).user?.email ?? 'admin',
  });
});

/**
 * DELETE /admin/users/:id/subscription
 * Revokes premium access by setting paid_until = NULL (falls back to trial).
 */
router.delete('/users/:id/subscription', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { rows: userRows } = await pool.query('SELECT id, full_name, email FROM users WHERE id = $1', [id]);
  if (!userRows.length) { sendError(res, 404, 'Utilisateur introuvable'); return; }

  await pool.query(
    `UPDATE subscriptions SET paid_until = NULL, effective_until = GREATEST(trial_ends_at, NOW())
     WHERE user_id = $1`,
    [id],
  );
  res.json({ success: true, user: userRows[0] });
});

// ─── Catalogue abonnements (plans + entitlements) — distinct de subscriptions legacy ──
// Note: certains codes historiques/marketing peuvent exister côté admin (ex: "march_plus").
// Ils sont traités ici comme des alias vers un vrai plan du catalogue.

const CATALOG_PLAN_CODES = ['essential', 'course_pdf', 'elite_pass_7d', 'elite_monthly', 'march_plus'] as const;

function normalizeCatalogPlanCode(code: string) {
  // Marketing alias → vrai code DB.
  if (code === 'march_plus') return 'course_pdf';
  return code;
}

/**
 * GET /admin/users/:id/catalog-subscription
 * Snapshot `user_subscriptions` + compteurs usage (pour l’admin).
 */
router.get('/users/:id/catalog-subscription', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
  if (!rows.length) { sendError(res, 404, 'Utilisateur introuvable'); return; }
  try {
    const catalog = await getMySubscriptionSnapshot(id);
    const usage = await getUsageSnapshot(id);
    res.json({ catalog, usage });
  } catch (e: any) {
    sendError(res, 500, e.message ?? 'Server error');
  }
});

/**
 * POST /admin/users/:id/catalog-plan
 * Body: { planCode, periodDays?, note? } — active un plan du catalogue (user_subscriptions).
 */
router.post('/users/:id/catalog-plan', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { planCode, periodDays, note } = req.body as {
    planCode?: string;
    periodDays?: number;
    note?: string;
  };
  if (!planCode || !CATALOG_PLAN_CODES.includes(planCode as (typeof CATALOG_PLAN_CODES)[number])) {
    sendError(res, 400, `planCode requis: ${CATALOG_PLAN_CODES.join(', ')}`);
    return;
  }
  const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
  if (!rows.length) { sendError(res, 404, 'Utilisateur introuvable'); return; }
  try {
    const normalizedPlanCode = normalizeCatalogPlanCode(planCode);
    const subscription = await activateSubscriptionForUser({
      userId: id,
      planCode: normalizedPlanCode,
      periodDays:
        typeof periodDays === 'number' && periodDays > 0 ? Math.floor(periodDays) : undefined,
      source: 'admin',
      providerRef: note?.trim() || null,
    });
    res.json({ success: true, subscription });
  } catch (e: any) {
    sendError(res, e.status || 500, e.message ?? 'Server error');
  }
});

export default router;
