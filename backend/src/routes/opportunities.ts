import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { startOpportunitiesScrape, getOpportunitiesScrapeJob, listOpportunitiesScrapeJobs } from '../services/opportunitiesScrapeService';

const router = Router();
const requireAdmin = requireRole('admin');

const opportunitySchema = z.object({
  title: z.string().min(3).max(600),
  opportunityType: z.enum(['program', 'scholarship', 'exchange', 'internship', 'fellowship', 'grant', 'summer_school', 'other']).default('other'),
  providerName: z.string().max(255).optional(),
  hostCountry: z.string().max(120).optional(),
  hostCity: z.string().max(120).optional(),
  hostInstitution: z.string().max(255).optional(),
  programLevel: z.string().optional(),
  programDurationText: z.string().optional(),
  programDurationMonths: z.number().int().optional(),
  description: z.string().optional(),
  eligibility: z.string().optional(),
  benefits: z.string().optional(),
  hasScholarship: z.boolean().optional(),
  scholarshipDetails: z.string().optional(),
  applyUrl: z.string().url().optional(),
  officialUrl: z.string().url().optional(),
  sourceName: z.string().max(255).optional(),
  sourceUrl: z.string().url().optional(),
  deadline: z.string().optional(), // YYYY-MM-DD
  isActive: z.boolean().optional(),
});

function parseBool(s?: string): boolean | undefined {
  if (s == null) return undefined;
  const v = String(s).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return undefined;
}

// ── Mobile: approved opportunities only ────────────────────────────────────────
// GET /api/v1/opportunities?type=&country=&search=&level=&institution=&city=&hasScholarship=&availability=available|expired|all&deadlineYear=&page=1&limit=20
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const {
    type,
    country,
    search,
    level,
    institution,
    city,
    hasScholarship,
    availability = 'available',
    deadlineYear,
    page = '1',
    limit = '20',
  } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [
    `status = 'approved'`,
    `is_active = TRUE`,
  ];
  const params: (string | number | boolean)[] = [];
  let p = 1;

  if ((availability || '').toLowerCase() === 'available') {
    conditions.push(`(deadline IS NULL OR deadline >= CURRENT_DATE)`);
  } else if ((availability || '').toLowerCase() === 'expired') {
    conditions.push(`(deadline IS NOT NULL AND deadline < CURRENT_DATE)`);
  } else {
    // all → no deadline filter
  }

  if (type) { conditions.push(`opportunity_type = $${p++}`); params.push(type); }
  if (country) { conditions.push(`host_country ILIKE $${p++}`); params.push(country); }
  if (level) { conditions.push(`program_level ILIKE $${p++}`); params.push(level); }
  if (institution) { conditions.push(`host_institution ILIKE $${p++}`); params.push(`%${institution}%`); }
  if (city) { conditions.push(`host_city ILIKE $${p++}`); params.push(`%${city}%`); }
  const hs = parseBool(hasScholarship);
  if (hs !== undefined) { conditions.push(`has_scholarship = $${p++}`); params.push(hs); }
  if (deadlineYear && /^\d{4}$/.test(deadlineYear)) {
    conditions.push(`EXTRACT(YEAR FROM deadline) = $${p++}`);
    params.push(parseInt(deadlineYear, 10));
  }
  if (search) {
    conditions.push(`(title ILIKE $${p} OR provider_name ILIKE $${p} OR description ILIKE $${p} OR host_institution ILIKE $${p})`);
    params.push(`%${search}%`); p++;
  }

  const where = conditions.join(' AND ');

  const { rows } = await pool.query(
    `SELECT id, title, opportunity_type, provider_name, host_country, host_city, host_institution,
            program_level, program_duration_text, program_duration_months,
            benefits, has_scholarship, scholarship_details,
            apply_url, official_url, deadline, created_at
     FROM opportunities
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, limitNum, offset],
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM opportunities WHERE ${where}`,
    params,
  );

  res.json({
    data: rows,
    total: parseInt(countResult.rows[0].count, 10),
    page: pageNum,
    limit: limitNum,
  });
});

// ── Admin: list extracted opportunities ────────────────────────────────────────
// GET /api/v1/opportunities/admin?status=pending|approved|rejected&page=1&limit=20&search=&type=&level=&institution=&city=&country=&hasScholarship=&availability=available|expired|all&deadlineYear=&active=true|false|all
router.get('/admin/list', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const {
    status = 'pending',
    page = '1',
    limit = '20',
    search = '',
    type,
    level,
    institution,
    city,
    country,
    hasScholarship,
    availability = 'all',
    deadlineYear,
    active = 'all',
  } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [`status = $1`];
  const params: (string | number | boolean)[] = [status];
  let p = 2;

  if (type) { conditions.push(`opportunity_type = $${p++}`); params.push(type); }
  if (level) { conditions.push(`program_level ILIKE $${p++}`); params.push(level); }
  if (institution) { conditions.push(`host_institution ILIKE $${p++}`); params.push(`%${institution}%`); }
  if (city) { conditions.push(`host_city ILIKE $${p++}`); params.push(`%${city}%`); }
  if (country) { conditions.push(`host_country ILIKE $${p++}`); params.push(country); }
  const hs = parseBool(hasScholarship);
  if (hs !== undefined) { conditions.push(`has_scholarship = $${p++}`); params.push(hs); }
  if ((availability || '').toLowerCase() === 'available') {
    conditions.push(`(deadline IS NULL OR deadline >= CURRENT_DATE)`);
  } else if ((availability || '').toLowerCase() === 'expired') {
    conditions.push(`(deadline IS NOT NULL AND deadline < CURRENT_DATE)`);
  }
  if (deadlineYear && /^\d{4}$/.test(deadlineYear)) {
    conditions.push(`EXTRACT(YEAR FROM deadline) = $${p++}`);
    params.push(parseInt(deadlineYear, 10));
  }
  if ((active || '').toLowerCase() === 'true') conditions.push(`is_active = TRUE`);
  if ((active || '').toLowerCase() === 'false') conditions.push(`is_active = FALSE`);

  if (search?.trim()) {
    conditions.push(`(title ILIKE $${p} OR provider_name ILIKE $${p} OR host_country ILIKE $${p} OR host_institution ILIKE $${p})`);
    params.push(`%${search.trim()}%`); p++;
  }

  const where = conditions.join(' AND ');

  const { rows } = await pool.query(
    `SELECT *
     FROM opportunities
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, limitNum, offset],
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM opportunities WHERE ${where}`,
    params,
  );

  res.json({
    data: rows,
    total: parseInt(countResult.rows[0].count, 10),
    page: pageNum,
    limit: limitNum,
  });
});

// ── Admin: Scrape jobs (one-click) ────────────────────────────────────────────

// POST /api/v1/opportunities/admin/scrape/start  → { jobId }
router.post('/admin/scrape/start', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const jobId = await startOpportunitiesScrape(req.user!.id);
  res.json({ jobId });
});

// GET /api/v1/opportunities/admin/scrape/:jobId → job status + logs
router.get('/admin/scrape/:jobId', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const job = getOpportunitiesScrapeJob(req.params.jobId);
  if (!job) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(job);
});

// GET /api/v1/opportunities/admin/scrape  → list jobs
router.get('/admin/scrape', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  res.json(listOpportunitiesScrapeJobs());
});

// POST /api/v1/opportunities/admin/bulk-hide  { ids?: string[], status?: pending|approved|rejected, search?: string }
// If ids[] is provided → hide those ids.
// Else hide ALL rows matching (status + optional search).
router.post('/admin/bulk-hide', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    ids: z.array(z.string().uuid()).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    search: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { ids, status, search } = parsed.data;

  if (ids && ids.length > 0) {
    const r = await pool.query(
      `UPDATE opportunities SET is_active = FALSE, updated_at = NOW()
       WHERE id = ANY($1::uuid[])
       RETURNING id`,
      [ids],
    );
    res.json({ ok: true, updated: r.rowCount });
    return;
  }

  if (!status) {
    res.status(400).json({ error: 'Provide ids[] or status' });
    return;
  }

  const conditions: string[] = [`status = $1`];
  const params: any[] = [status];
  let p = 2;
  if (search?.trim()) {
    conditions.push(`(title ILIKE $${p} OR provider_name ILIKE $${p} OR host_country ILIKE $${p})`);
    params.push(`%${search.trim()}%`);
    p++;
  }

  const where = conditions.join(' AND ');
  const r = await pool.query(
    `UPDATE opportunities SET is_active = FALSE, updated_at = NOW()
     WHERE ${where}
     RETURNING id`,
    params,
  );
  res.json({ ok: true, updated: r.rowCount });
});

// POST /api/v1/opportunities/admin/bulk-delete  { ids?: string[], status?: pending|approved|rejected, search?: string }
// If ids[] is provided → delete those ids.
// Else delete ALL rows matching (status + optional search).
router.post('/admin/bulk-delete', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    ids: z.array(z.string().uuid()).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    search: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { ids, status, search } = parsed.data;

  if (ids && ids.length > 0) {
    const r = await pool.query(
      `DELETE FROM opportunities
       WHERE id = ANY($1::uuid[])
       RETURNING id`,
      [ids],
    );
    res.json({ ok: true, deleted: r.rowCount });
    return;
  }

  if (!status) {
    res.status(400).json({ error: 'Provide ids[] or status' });
    return;
  }

  const conditions: string[] = [`status = $1`];
  const params: any[] = [status];
  let p = 2;
  if (search?.trim()) {
    conditions.push(`(title ILIKE $${p} OR provider_name ILIKE $${p} OR host_country ILIKE $${p})`);
    params.push(`%${search.trim()}%`);
    p++;
  }

  const where = conditions.join(' AND ');
  const r = await pool.query(
    `DELETE FROM opportunities
     WHERE ${where}
     RETURNING id`,
    params,
  );
  res.json({ ok: true, deleted: r.rowCount });
});

// POST /api/v1/opportunities/admin (create directly, default approved)
router.post('/admin', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = opportunitySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const { rows } = await pool.query(
    `INSERT INTO opportunities
       (title, opportunity_type, provider_name, host_country, host_city, host_institution,
        program_level, program_duration_text, program_duration_months,
        description, eligibility, benefits,
        has_scholarship, scholarship_details,
        apply_url, official_url, source_name, source_url, deadline,
        status, extracted_by, moderated_by, moderated_at)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'approved',$20,$20,NOW())
     RETURNING *`,
    [
      d.title,
      d.opportunityType,
      d.providerName ?? null,
      d.hostCountry ?? null,
      d.hostCity ?? null,
      d.hostInstitution ?? null,
      d.programLevel ?? null,
      d.programDurationText ?? null,
      d.programDurationMonths ?? null,
      d.description ?? null,
      d.eligibility ?? null,
      d.benefits ?? null,
      d.hasScholarship ?? false,
      d.scholarshipDetails ?? null,
      d.applyUrl ?? null,
      d.officialUrl ?? null,
      d.sourceName ?? null,
      d.sourceUrl ?? null,
      d.deadline || null,
      req.user!.id,
    ],
  );
  res.status(201).json(rows[0]);
});

// PUT /api/v1/opportunities/admin/:id (edit fields)
router.put('/admin/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = opportunitySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const fields = Object.entries({
    title: d.title,
    opportunity_type: d.opportunityType,
    provider_name: d.providerName,
    host_country: d.hostCountry,
    host_city: d.hostCity,
    host_institution: d.hostInstitution,
    program_level: d.programLevel,
    program_duration_text: d.programDurationText,
    program_duration_months: d.programDurationMonths,
    description: d.description,
    eligibility: d.eligibility,
    benefits: d.benefits,
    has_scholarship: d.hasScholarship,
    scholarship_details: d.scholarshipDetails,
    apply_url: d.applyUrl,
    official_url: d.officialUrl,
    source_name: d.sourceName,
    source_url: d.sourceUrl,
    deadline: d.deadline,
    is_active: d.isActive,
  }).filter(([, v]) => v !== undefined);

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  const sets = fields.map(([col], i) => `${col} = $${i + 2}`).join(', ');
  const vals = fields.map(([, v]) => v);

  const { rows } = await pool.query(
    `UPDATE opportunities
     SET ${sets}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [req.params.id, ...vals],
  );

  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// PUT /api/v1/opportunities/admin/:id/moderate { action: approve|reject, reason? }
router.put('/admin/:id/moderate', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { action, reason } = req.body as { action: 'approve' | 'reject'; reason?: string };
  if (!['approve', 'reject'].includes(action)) { res.status(400).json({ error: 'action must be approve or reject' }); return; }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const { rows } = await pool.query(
    `UPDATE opportunities
     SET status = $1,
         reject_reason = $2,
         moderated_by = $3,
         moderated_at = NOW(),
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [status, action === 'reject' ? (reason ?? null) : null, req.user!.id, req.params.id],
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// DELETE /api/v1/opportunities/admin/:id (hard delete)
router.delete('/admin/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const r = await pool.query(`DELETE FROM opportunities WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

// GET /api/v1/opportunities/:id (approved only)
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT *
     FROM opportunities
     WHERE id = $1 AND status = 'approved' AND is_active = TRUE`,
    [req.params.id],
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

export default router;

