import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const entrySchema = z.object({
  nameAr: z.string().min(1),
  name: z.string().optional(),
  teacher: z.string().optional(),
  room: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  semester: z.coerce.number().int().min(1).max(2).default(1),
  academicYear: z.string().default('2024-2025'),
});

// GET /api/v1/timetable — user's entries
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT * FROM timetable_entries WHERE user_id = $1 ORDER BY day_of_week, start_time`,
    [req.user!.id]
  );
  res.json(rows);
});

// POST /api/v1/timetable
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO timetable_entries (user_id, name_ar, name, teacher, room, color, day_of_week, start_time, end_time, semester, academic_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user!.id, d.nameAr, d.name, d.teacher, d.room, d.color, d.dayOfWeek, d.startTime, d.endTime, d.semester, d.academicYear]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/v1/timetable/:id
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = entrySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const fields = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map(([k], i) => `${camelToSnake(k)} = $${i + 3}`).join(', ');
  const values = fields.map(([, v]) => v);
  const { rows } = await pool.query(
    `UPDATE timetable_entries SET ${setClauses} WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user!.id, ...values]
  );
  if (!rows.length) { res.status(404).json({ error: 'Entry not found' }); return; }
  res.json(rows[0]);
});

// DELETE /api/v1/timetable/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { rowCount } = await pool.query(
    `DELETE FROM timetable_entries WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.id]
  );
  if (!rowCount) { res.status(404).json({ error: 'Entry not found' }); return; }
  res.status(204).end();
});

const camelToSnake = (s: string) => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);

export default router;
