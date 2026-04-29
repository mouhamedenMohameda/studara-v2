import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── GET /api/v1/exams  ───────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const rows = await pool.query(
      `SELECT id, subject, exam_date, color, notes, is_done, created_at
       FROM exam_countdowns
       WHERE user_id = $1
       ORDER BY exam_date ASC`,
      [userId]
    );
    res.json(
      rows.rows.map(r => ({
        id:        r.id,
        subject:   r.subject,
        examDate:  r.exam_date,
        color:     r.color,
        notes:     r.notes,
        isDone:    r.is_done,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    console.error('[exams/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/v1/exams  ──────────────────────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { subject, examDate, color = '#DC2626', notes } = req.body as {
    subject: string;
    examDate: string;
    color?: string;
    notes?: string;
  };

  if (!subject?.trim() || !examDate) {
    res.status(400).json({ error: 'subject and examDate are required' });
    return;
  }

  try {
    const row = await pool.query(
      `INSERT INTO exam_countdowns (user_id, subject, exam_date, color, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, subject, exam_date, color, notes, is_done, created_at`,
      [userId, subject.trim(), examDate, color, notes || null]
    );
    const r = row.rows[0];
    res.status(201).json({
      id:        r.id,
      subject:   r.subject,
      examDate:  r.exam_date,
      color:     r.color,
      notes:     r.notes,
      isDone:    r.is_done,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('[exams/post]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/v1/exams/:id  ─────────────────────────────────────────────────
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id }    = req.params;
  const { isDone } = req.body as { isDone?: boolean };

  try {
    const row = await pool.query(
      `UPDATE exam_countdowns
       SET is_done = $3
       WHERE id = $1 AND user_id = $2
       RETURNING id, subject, exam_date, color, is_done`,
      [id, userId, isDone ?? true]
    );
    if (!row.rows.length) {
      res.status(404).json({ error: 'Exam not found' });
      return;
    }
    const r = row.rows[0];
    res.json({ id: r.id, subject: r.subject, examDate: r.exam_date, color: r.color, isDone: r.is_done });
  } catch (err) {
    console.error('[exams/patch]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/v1/exams/:id  ────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id }    = req.params;

  try {
    const row = await pool.query(
      `DELETE FROM exam_countdowns WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (!row.rows.length) {
      res.status(404).json({ error: 'Exam not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[exams/delete]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
