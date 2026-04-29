import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
const requireAdmin = requireRole('admin');

const listingSchema = z.object({
  title:         z.string().min(3).max(200),
  titleAr:       z.string().max(200).optional(),
  type:          z.enum(['studio', 'chambre', 'appartement', 'colocation']),
  price:         z.number().int().positive(),
  area:          z.string().max(100).optional(),
  description:   z.string().max(3000).optional(),
  descriptionAr: z.string().max(3000).optional(),
  phone:         z.string().max(30).optional(),
  whatsapp:      z.string().max(30).optional(),
  furnished:     z.boolean().default(false),
  features:      z.array(z.string().max(60)).max(10).default([]),
});

// ── GET /api/v1/housing — public, returns approved listings ──────────────────
router.get('/', async (_req, res: Response) => {
  const { rows } = await pool.query(
    `SELECT h.*, u.full_name AS poster_name
     FROM housing_listings h
     LEFT JOIN users u ON h.user_id = u.id
     WHERE h.status = 'approved'
     ORDER BY h.created_at DESC`
  );
  res.json(rows);
});

// ── GET /api/v1/housing/mine — user's own listings (all statuses) ────────────
router.get('/mine', authenticate, async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT * FROM housing_listings WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user!.id]
  );
  res.json(rows);
});

// ── POST /api/v1/housing — submit new listing (pending) ──────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = listingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const { rows } = await pool.query(
    `INSERT INTO housing_listings
       (user_id, title, title_ar, type, price, area, description, description_ar,
        phone, whatsapp, furnished, features, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')
     RETURNING *`,
    [req.user!.id, d.title, d.titleAr ?? null, d.type, d.price, d.area ?? null,
     d.description ?? null, d.descriptionAr ?? null, d.phone ?? null,
     d.whatsapp ?? null, d.furnished, d.features]
  );
  res.status(201).json(rows[0]);
});

// ── PUT /api/v1/housing/:id — owner edits own listing (only pending/rejected) ─
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  // Fetch existing
  const { rows: existing } = await pool.query(
    `SELECT * FROM housing_listings WHERE id = $1`, [req.params.id]
  );
  if (!existing[0]) { res.status(404).json({ error: 'Not found' }); return; }

  const listing = existing[0];
  const isAdmin = req.user!.role === 'admin';

  // Only owner or admin can edit
  if (listing.user_id !== req.user!.id && !isAdmin) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  // Non-admin can only edit pending or rejected
  if (!isAdmin && listing.status === 'approved') {
    res.status(403).json({ error: 'Approved listings cannot be edited' }); return;
  }

  const parsed = listingSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const fields: string[] = [];
  const vals:   unknown[] = [];
  let p = 1;

  const map: Record<string, unknown> = {
    title: d.title, title_ar: d.titleAr, type: d.type, price: d.price,
    area: d.area, description: d.description, description_ar: d.descriptionAr,
    phone: d.phone, whatsapp: d.whatsapp, furnished: d.furnished, features: d.features,
  };
  for (const [col, val] of Object.entries(map)) {
    if (val !== undefined) { fields.push(`${col} = $${p++}`); vals.push(val); }
  }

  // Re-set status to pending after owner edits so admin re-reviews
  if (!isAdmin) { fields.push(`status = 'pending'`); fields.push(`reject_reason = NULL`); }

  fields.push(`updated_at = NOW()`);
  vals.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE housing_listings SET ${fields.join(', ')} WHERE id = $${p} RETURNING *`,
    vals
  );
  res.json(rows[0]);
});

// ── DELETE /api/v1/housing/:id — owner or admin ───────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT user_id FROM housing_listings WHERE id = $1`, [req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }

  const isOwner = rows[0].user_id === req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  if (!isOwner && !isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  await pool.query(`DELETE FROM housing_listings WHERE id = $1`, [req.params.id]);
  res.status(204).end();
});

// ── Admin: GET /api/v1/housing/admin/list ─────────────────────────────────────
router.get('/admin/list', authenticate, requireAdmin, async (_req, res: Response) => {
  const { rows } = await pool.query(
    `SELECT h.*, u.full_name AS poster_name, u.email AS poster_email
     FROM housing_listings h
     LEFT JOIN users u ON h.user_id = u.id
     ORDER BY
       CASE h.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       h.created_at DESC`
  );
  res.json(rows);
});

// ── Admin: PUT /api/v1/housing/admin/:id/moderate ────────────────────────────
router.put('/admin/:id/moderate', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { action, reason } = req.body as { action: 'approve' | 'reject'; reason?: string };
  if (!['approve', 'reject'].includes(action)) {
    res.status(400).json({ error: 'action must be approve or reject' }); return;
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const { rows } = await pool.query(
    `UPDATE housing_listings
     SET status = $1, reject_reason = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, reason ?? null, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

export default router;
