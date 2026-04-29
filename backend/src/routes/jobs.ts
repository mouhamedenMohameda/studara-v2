import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
const requireAdmin = requireRole('admin');

const jobSchema = z.object({
  title:        z.string().min(1),
  company:      z.string().min(1),
  location:     z.string().optional(),
  domain:       z.string().optional(),
  jobType:      z.enum(['stage', 'cdi', 'cdd', 'freelance', 'other']).default('stage'),
  description:  z.string().optional(),
  requirements: z.string().optional(),
  applyUrl:     z.string().url().optional(),
  deadline:     z.string().optional(),
  isActive:     z.boolean().optional(),
});

// GET /api/v1/jobs?domain=&type=&search=&page=1&limit=20
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { domain, type, search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(500, parseInt(limit, 10));
  const offset   = (pageNum - 1) * limitNum;

  // Only show active jobs whose deadline hasn't passed (or have no deadline)
  const conditions: string[] = ['is_active = TRUE', '(deadline IS NULL OR deadline >= CURRENT_DATE)'];
  const params: (string | number)[] = [];
  let p = 1;

  if (domain) { conditions.push(`domain = $${p++}`); params.push(domain); }
  if (type)   { conditions.push(`job_type = $${p++}`); params.push(type); }
  if (search) {
    conditions.push(`(title ILIKE $${p} OR company ILIKE $${p} OR description ILIKE $${p})`);
    params.push(`%${search}%`); p++;
  }

  const where = conditions.join(' AND ');
  const dataParams = [...params, limitNum, offset];

  const { rows } = await pool.query(
    `SELECT id, title, company, location, domain, job_type, description,
            apply_url, deadline, created_at
     FROM jobs WHERE ${where} ORDER BY created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    dataParams
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM jobs WHERE ${where}`,
    params
  );

  res.json({
    data: rows,
    total: parseInt(countResult.rows[0].count, 10),
    page: pageNum,
    limit: limitNum,
  });
});

// GET /api/v1/jobs/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT j.*, u.full_name AS poster_name
     FROM jobs j LEFT JOIN users u ON j.posted_by = u.id
     WHERE j.id = $1 AND j.is_active = TRUE`,
    [req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// POST /api/v1/jobs — admin only
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const { rows } = await pool.query(
    `INSERT INTO jobs (title, company, location, domain, job_type, description, requirements, apply_url, deadline, posted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [d.title, d.company, d.location, d.domain, d.jobType, d.description, d.requirements, d.applyUrl, d.deadline || null, req.user!.id]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/v1/jobs/:id — admin only
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = jobSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const fields = Object.entries({
    title: d.title, company: d.company, location: d.location,
    domain: d.domain, job_type: d.jobType, description: d.description,
    requirements: d.requirements, apply_url: d.applyUrl,
    deadline: d.deadline, is_active: d.isActive,
  }).filter(([, v]) => v !== undefined);

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  const sets = fields.map(([col], i) => `${col} = $${i + 2}`).join(', ');
  const vals = fields.map(([, v]) => v);
  const { rows } = await pool.query(
    `UPDATE jobs SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [req.params.id, ...vals]
  );
  res.json(rows[0]);
});

// DELETE /api/v1/jobs/:id — admin only (soft delete)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  await pool.query(`UPDATE jobs SET is_active = FALSE WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;
