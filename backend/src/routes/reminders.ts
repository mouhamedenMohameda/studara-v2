import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import {
  listReminders, createReminder, updateReminder,
  deleteReminder, listPendingGlobal, setReminderStatus,
} from '../services/reminderService';

const router = Router();
const requireAdmin = requireRole('admin');

const reminderSchema = z.object({
  title:        z.string().min(1),
  description:  z.string().optional(),
  reminderType: z.enum(['exam', 'assignment', 'course', 'other']).default('other'),
  scheduledAt:  z.string().datetime(),
  courseColor:  z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  scope:        z.enum(['personal', 'global']).default('personal'),
});

// GET /api/v1/reminders?scope=personal|global
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { scope, completed } = req.query as { scope?: string; completed?: string };
  try {
    const rows = await listReminders(req.user!.id, scope, completed);
    res.json(rows);
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

// POST /api/v1/reminders
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = reminderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    const reminder = await createReminder(req.user!.id, parsed.data);
    res.status(201).json(reminder);
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

// PUT /api/v1/reminders/:id
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const patch = z.object({
    title:        z.string().optional(),
    description:  z.string().optional(),
    reminderType: z.enum(['exam', 'assignment', 'course', 'other']).optional(),
    scheduledAt:  z.string().datetime().optional(),
    isCompleted:  z.boolean().optional(),
  }).safeParse(req.body);
  if (!patch.success) { res.status(400).json({ error: patch.error.flatten() }); return; }
  try {
    const reminder = await updateReminder(req.params.id, req.user!.id, patch.data);
    res.json(reminder);
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

// DELETE /api/v1/reminders/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await deleteReminder(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

// ADMIN: GET /api/v1/reminders/admin/pending
router.get('/admin/pending', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try { res.json(await listPendingGlobal()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ADMIN: PUT /api/v1/reminders/:id/approve
router.put('/:id/approve', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try { res.json(await setReminderStatus(req.params.id, 'approved')); }
  catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

// ADMIN: PUT /api/v1/reminders/:id/reject
router.put('/:id/reject', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try { res.json(await setReminderStatus(req.params.id, 'rejected')); }
  catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

export default router;
