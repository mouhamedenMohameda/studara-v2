import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createHash, randomBytes } from 'crypto';
import {
  registerUser, loginUser, rotateRefreshToken,
  revokeTokens, getProfile, updateProfile,
  RegisterResult,
} from '../services/authService';
import pool from '../db/pool';
import { sendPasswordResetPush } from '../services/expoPushService';
import { sendError } from '../utils/httpError';

const router = Router();

const INTENT_TTL_MIN = Math.max(5, parseInt(process.env.PASSWORD_RESET_INTENT_TTL_MIN || '20', 10) || 20);
const TICKET_TTL_MIN = Math.max(2, parseInt(process.env.PASSWORD_RESET_TICKET_TTL_MIN || '5', 10) || 5);

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

const registerSchema = z.object({
  email:        z.string().email(),
  password:     z.string().min(8),
  fullName:     z.string().min(2),
  university:   z.string(),
  faculty:      z.string(),
  filiere:      z.string().optional(),
  year:         z.number().int().min(1).max(7),
  referralCode: z.string().length(8).optional(),  // 8-char code from profile share
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string(),
});

// POST /api/v1/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.flatten() as any); return; }
  try {
    const result = await registerUser(parsed.data);
    res.status(201).json(result);
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.flatten() as any); return; }
  try {
    const result = await loginUser(parsed.data.email, parsed.data.password);
    res.json(result);
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) { sendError(res, 400, 'refreshToken required'); return; }
  try {
    const tokens = await rotateRefreshToken(refreshToken);
    res.json(tokens);
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  await revokeTokens(req.user!.id, req.body.refreshToken);
  res.status(204).end();
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getProfile(req.user!.id);
    res.json(user);
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

const updateProfileSchema = z.object({
  fullName:   z.string().min(2).optional(),
  university: z.string().optional(),
  faculty:    z.string().optional(),
  filiere:    z.string().optional(),
  year:       z.coerce.number().int().min(1).max(7).optional(),
});

// PUT /api/v1/auth/me
// fullName is updated immediately.
// faculty / university / year changes create a pending request — admin must approve.
router.put('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.flatten() as any); return; }
  try {
    const { fullName, faculty, university, filiere, year } = parsed.data;
    const userId = req.user!.id;

    // Faculty / university / filiere / year → pending request
    if (faculty || university || filiere || year != null) {
      // Cancel any existing pending request for this user
      await pool.query(
        `UPDATE faculty_change_requests SET status = 'rejected', resolved_at = NOW()
          WHERE user_id = $1 AND status = 'pending'`,
        [userId],
      );
      await pool.query(
        `INSERT INTO faculty_change_requests (user_id, new_faculty, new_university, new_filiere, new_year)
          VALUES ($1, $2, $3, $4, $5)`,
        [userId, faculty ?? null, university ?? null, filiere ?? null, year ?? null],
      );
      const user = await getProfile(userId);
      res.json({ user, facultyChangePending: true });
      return;
    }

    // Only fullName (or nothing): update directly (service throws 400 if nothing to update)
    const user = await updateProfile(userId, { fullName });
    // Backward-compatible response shape: return the user directly.
    res.json(user);
  } catch (e: any) { sendError(res, e.status || 500, e.message); }
});

// GET /api/v1/auth/me/faculty-change-status
router.get('/me/faculty-change-status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, new_faculty, new_university, new_filiere, new_year, status, admin_note, created_at
         FROM faculty_change_requests
        WHERE user_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [req.user!.id],
    );
    res.json(rows[0] ?? null);
  } catch (e: any) { sendError(res, 500, e.message); }
});

const resetRequestSchema = z.object({
  email:       z.string().email(),
  newPassword: z.string().min(8),
});

// POST /api/v1/auth/reset-request
router.post('/reset-request', async (req: Request, res: Response) => {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.flatten() as any); return; }
  try {
    // Deprecated legacy flow (admin approval) — keep neutral response.
    // New secure flow is POST /password-reset/request.
    res.json({ success: true });
  } catch (e: any) { sendError(res, 500, e.message); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Password reset — trusted device approval
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/v1/auth/password-reset/request  (unauth)
router.post('/password-reset/request', async (req: Request, res: Response) => {
  const schema = z.object({ email: z.string().email().transform(v => v.trim().toLowerCase()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { email } = parsed.data;

  // Neutral response (anti-enumeration)
  res.json({ ok: true });

  try {
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || null;

    const userRes = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    const user = userRes.rows[0];
    if (!user) return;

    // Expire old pending intents so only latest is usable
    await pool.query(
      `UPDATE password_reset_intents SET status = 'EXPIRED'
       WHERE user_id = $1 AND status = 'PENDING_APPROVAL'`,
      [user.id],
    );

    const intentRes = await pool.query<{ id: string }>(
      `INSERT INTO password_reset_intents (user_id, expires_at, requested_ip, requested_user_agent)
       VALUES ($1, NOW() + ($2 || ' minutes')::INTERVAL, $3, $4)
       RETURNING id`,
      [user.id, String(INTENT_TTL_MIN), ip, ua],
    );
    const intentId = intentRes.rows[0]!.id;

    const devRes = await pool.query<{ expo_push_token: string }>(
      `SELECT expo_push_token FROM user_devices WHERE user_id = $1`,
      [user.id],
    );
    const tokens = devRes.rows.map(r => r.expo_push_token).filter(Boolean);
    if (tokens.length) await sendPasswordResetPush(tokens, intentId);
  } catch {
    // non-blocking
  }
});

// GET /api/v1/auth/password-reset/intents/:id (auth)
router.get('/password-reset/intents/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const intentId = req.params.id;

  // Auto-expire if needed
  await pool.query(
    `UPDATE password_reset_intents
     SET status = 'EXPIRED'
     WHERE id = $1 AND user_id = $2
       AND status IN ('PENDING_APPROVAL','APPROVED')
       AND expires_at <= NOW()`,
    [intentId, userId],
  );

  const { rows } = await pool.query(
    `SELECT id, status, requested_at, requested_ip, requested_user_agent, requested_device_label
     FROM password_reset_intents
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [intentId, userId],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }

  const r = rows[0];
  res.json({
    id: r.id,
    status: r.status,
    requestedAt: r.requested_at,
    requestedIp: r.requested_ip,
    requestedUserAgent: r.requested_user_agent,
    requestedDeviceLabel: r.requested_device_label,
  });
});

// POST /api/v1/auth/password-reset/intents/:id/approve (auth) → { ticket }
router.post('/password-reset/intents/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const intentId = req.params.id;

  const intentRes = await pool.query<{ status: string; expires_at: string }>(
    `SELECT status, expires_at FROM password_reset_intents WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [intentId, userId],
  );
  const intent = intentRes.rows[0];
  if (!intent) { res.status(404).json({ error: 'Not found' }); return; }

  if (new Date(intent.expires_at).getTime() <= Date.now()) {
    await pool.query(`UPDATE password_reset_intents SET status='EXPIRED' WHERE id=$1`, [intentId]);
    res.status(400).json({ error: 'Expired' });
    return;
  }
  if (intent.status !== 'PENDING_APPROVAL') { res.status(400).json({ error: 'Already handled' }); return; }

  const ticket = randomToken(32);
  const ticketHash = sha256(ticket);

  await pool.query('BEGIN');
  try {
    await pool.query(
      `UPDATE password_reset_intents SET status='APPROVED', approved_at=NOW() WHERE id=$1 AND user_id=$2`,
      [intentId, userId],
    );
    await pool.query(
      `INSERT INTO password_reset_tickets (intent_id, ticket_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
      [intentId, ticketHash, String(TICKET_TTL_MIN)],
    );
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }

  res.json({ ticket, expiresAt: new Date(Date.now() + TICKET_TTL_MIN * 60_000).toISOString() });
});

// POST /api/v1/auth/password-reset/intents/:id/deny (auth)
router.post('/password-reset/intents/:id/deny', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const intentId = req.params.id;
  await pool.query(
    `UPDATE password_reset_intents SET status='DENIED'
     WHERE id=$1 AND user_id=$2 AND status='PENDING_APPROVAL'`,
    [intentId, userId],
  );
  res.json({ ok: true });
});

// POST /api/v1/auth/password-reset/confirm (ticket-based)
router.post('/password-reset/confirm', async (req: Request, res: Response) => {
  const schema = z.object({
    intentId: z.string().uuid(),
    ticket: z.string().min(20),
    newPassword: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { intentId, ticket, newPassword } = parsed.data;
  const ticketHash = sha256(ticket);

  const intentRes = await pool.query<{ user_id: string; status: string; expires_at: string }>(
    `SELECT user_id, status, expires_at FROM password_reset_intents WHERE id=$1 LIMIT 1`,
    [intentId],
  );
  const intent = intentRes.rows[0];
  if (!intent) { res.status(400).json({ error: 'Invalid request' }); return; }
  if (new Date(intent.expires_at).getTime() <= Date.now()) {
    await pool.query(`UPDATE password_reset_intents SET status='EXPIRED' WHERE id=$1`, [intentId]);
    res.status(400).json({ error: 'Expired' });
    return;
  }
  if (intent.status !== 'APPROVED') { res.status(400).json({ error: 'Not approved' }); return; }

  await pool.query('BEGIN');
  try {
    const ticketRes = await pool.query<{ id: string; expires_at: string; used_at: string | null }>(
      `SELECT id, expires_at, used_at
       FROM password_reset_tickets
       WHERE intent_id=$1 AND ticket_hash=$2
       ORDER BY expires_at DESC
       LIMIT 1`,
      [intentId, ticketHash],
    );
    const tr = ticketRes.rows[0];
    if (!tr) throw new Error('Invalid ticket');
    if (tr.used_at) throw new Error('Ticket already used');
    if (new Date(tr.expires_at).getTime() <= Date.now()) throw new Error('Ticket expired');

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, intent.user_id]);
    await pool.query('UPDATE password_reset_tickets SET used_at=NOW() WHERE id=$1', [tr.id]);
    await pool.query("UPDATE password_reset_intents SET status='COMPLETED', completed_at=NOW() WHERE id=$1", [intentId]);

    // Global logout: delete all refresh tokens for this user
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [intent.user_id]);

    await pool.query('COMMIT');
    res.json({ ok: true });
  } catch (e: any) {
    await pool.query('ROLLBACK');
    res.status(400).json({ error: e?.message || 'Invalid request' });
  }
});

// POST /api/v1/auth/devices/register (auth)
router.post('/devices/register', authenticate, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    expoPushToken: z.string().min(10),
    platform: z.enum(['ios', 'android']),
    deviceLabel: z.string().max(80).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { expoPushToken, platform, deviceLabel } = parsed.data;
  const userId = req.user!.id;
  await pool.query(
    `INSERT INTO user_devices (user_id, expo_push_token, platform, device_label, last_seen_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, expo_push_token)
     DO UPDATE SET platform=EXCLUDED.platform, device_label=EXCLUDED.device_label, last_seen_at=NOW()`,
    [userId, expoPushToken, platform, deviceLabel ?? null],
  );
  res.json({ ok: true });
});

export default router;
