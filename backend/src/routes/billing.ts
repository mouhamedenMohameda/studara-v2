/**
 * Billing routes
 *
 * GET  /api/v1/billing/status                          — authenticated user's subscription info
 * POST /api/v1/billing/extend                          — admin grants N paid days to any user
 * GET  /api/v1/billing/users                           — admin: list all subscriptions (paginated)
 *
 * ── Per-Feature Premium ──────────────────────────────────────────────────────
 * GET  /api/v1/billing/features                        — list all purchasable features + user's access
 * GET  /api/v1/billing/features/:key/access            — user: check access to one feature
 * GET  /api/v1/billing/banks                           — list Mauritanian banks for picker
 * POST /api/v1/billing/feature-request                 — user submits request (multipart: screenshot required)
 * GET  /api/v1/billing/feature-request/me              — user's own requests history
 * GET  /api/v1/billing/feature-requests                — admin: all requests (filterable by status)
 * PUT  /api/v1/billing/feature-requests/:id/approve    — admin approves → user gets access
 * PUT  /api/v1/billing/feature-requests/:id/reject     — admin rejects with reason
 */

import path from 'path';
import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import {
  getSubscriptionStatus,
  activateSubscription,
  hasPremiumFeature,
  topUpWallet,
  getWallet,
  deductFromWallet,
  creditReferralBonusIfEligible,
} from '../services/subscriptionService';
import pool from '../db/pool';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

// ── Screenshot upload (images only, max 10 MB) ────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const screenshotStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'payment-screenshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});
const uploadScreenshot = multer({
  storage: screenshotStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images are accepted (JPEG, PNG, WEBP, HEIC)'));
    }
  },
});

const router = Router();

// ── Own status ─────────────────────────────────────────────────────────────────
// GET /api/v1/billing/status
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const info = await getSubscriptionStatus(req.user!.id);
    res.json(info);
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Admin: extend any user ─────────────────────────────────────────────────────
// POST /api/v1/billing/extend  { userId, days }
router.post(
  '/extend',
  authenticate,
  requireRole('admin'),
  async (req: AuthRequest, res: Response) => {
    const { userId, days } = req.body as { userId: string; days: number };
    if (!userId || !days || days < 1) {
      res.status(400).json({ error: 'userId and days (≥1) required' });
      return;
    }
    try {
      const info = await activateSubscription(userId, days);
      res.json({ success: true, subscription: info });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  },
);

// ── Admin: list all subscriptions ─────────────────────────────────────────────
// GET /api/v1/billing/users?page=1&limit=20&status=expired
router.get(
  '/users',
  authenticate,
  requireRole('admin', 'moderator'),
  async (req: AuthRequest, res: Response) => {
    const { page = '1', limit = '20', status } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const params: unknown[] = [parseInt(limit), offset];
    let where = '';
    if (status) {
      // Compute effective status in SQL for filtering
      const statusFilter =
        status === 'expired'
          ? `(s.trial_ends_at + s.bonus_days * INTERVAL '1 day') <= NOW()
               AND (s.paid_until IS NULL OR (s.paid_until + s.bonus_days * INTERVAL '1 day') <= NOW())`
          : status === 'trial'
            ? `s.paid_until IS NULL AND (s.trial_ends_at + s.bonus_days * INTERVAL '1 day') > NOW()`
            : status === 'active'
              ? `s.paid_until IS NOT NULL AND (GREATEST(s.paid_until, s.trial_ends_at) + s.bonus_days * INTERVAL '1 day') > NOW()`
              : '';
      if (statusFilter) where = `WHERE ${statusFilter}`;
    }

    const { rows } = await pool.query(
      `SELECT
         u.id, u.email, u.full_name,
         s.trial_ends_at, s.paid_until,
         s.bonus_days, s.accepted_uploads_count, s.effective_until
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       ${where}
       ORDER BY s.effective_until ASC
       LIMIT $1 OFFSET $2`,
      params,
    );

    const count = await pool.query(
      `SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id = s.user_id ${where}`,
      where ? [] : [],
    );

    res.json({
      data:  rows,
      total: parseInt(count.rows[0].count),
      page:  parseInt(page),
      limit: parseInt(limit),
    });
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// PER-FEATURE PREMIUM BILLING
// ═════════════════════════════════════════════════════════════════════════════

// ── List all purchasable features (with user's current access) ────────────────
// GET /api/v1/billing/features
router.get('/features', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows: features } = await pool.query(
      `SELECT key, label_ar, label_fr, description_ar, description_fr,
              price_mru, duration_days, sort_order, is_active
       FROM premium_features
       ORDER BY sort_order ASC`,
    );

    // For each feature, fetch the user's wallet balance
    const userId   = req.user!.id;
    const isAdmin  = req.user!.role === 'admin' || req.user!.role === 'moderator';
    const { rows: wallets } = await pool.query(
      `SELECT feature_key, balance_mru, total_topped_up_mru, total_spent_mru
       FROM user_feature_wallets WHERE user_id = $1`,
      [userId],
    );
    const walletMap: Record<string, { balance_mru: number; total_topped_up_mru: number; total_spent_mru: number }> = {};
    for (const w of wallets) walletMap[w.feature_key] = w;
    const universalBalance = walletMap['wallet_universal']?.balance_mru ?? 0;
    const universalTopUp = walletMap['wallet_universal']?.total_topped_up_mru ?? 0;
    const universalSpent = walletMap['wallet_universal']?.total_spent_mru ?? 0;

    const result = features.map((f: any) => {
      const active = !!f.is_active;
      const featureBal = walletMap[f.key]?.balance_mru ?? 0;
      const hasWalletCredit = featureBal > 0 || universalBalance > 0;
      return {
        ...f,
        is_active: active,
        hasAccess: isAdmin ? true : (active && hasWalletCredit),
        balanceMru: isAdmin
          ? 999999
          : (featureBal > 0 ? featureBal : universalBalance),
        totalToppedUpMru: featureBal > 0 ? (walletMap[f.key]?.total_topped_up_mru ?? 0) : universalTopUp,
        totalSpentMru: featureBal > 0 ? (walletMap[f.key]?.total_spent_mru ?? 0) : universalSpent,
      };
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: enable/disable features (central kill switch) ──────────────────────

router.get(
  '/admin/features',
  authenticate,
  requireRole('admin', 'moderator'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT key, label_ar, label_fr, description_ar, description_fr,
                sort_order, is_active
         FROM premium_features
         ORDER BY sort_order, key`,
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

router.put(
  '/admin/features/:key',
  authenticate,
  requireRole('admin', 'moderator'),
  async (req: AuthRequest, res: Response) => {
    const { key } = req.params;
    const { is_active } = req.body as { is_active?: boolean };
    if (typeof is_active !== 'boolean') {
      res.status(400).json({ error: 'is_active must be boolean' });
      return;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE premium_features
         SET is_active = $1
         WHERE key = $2
         RETURNING key, is_active`,
        [is_active, key],
      );
      if (!rows.length) { res.status(404).json({ error: 'Feature not found' }); return; }
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

router.post(
  '/admin/features/disable-all',
  authenticate,
  requireRole('admin', 'moderator'),
  async (_req: AuthRequest, res: Response) => {
    try {
      await pool.query(`UPDATE premium_features SET is_active = false WHERE key <> 'wallet_universal'`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// GLOBAL APP FEATURES (NOT ONLY PREMIUM)
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/v1/billing/app-features  (authenticated users)
router.get('/app-features', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, label, is_active FROM app_features ORDER BY key`,
    );
    res.json(rows);
  } catch (e: any) {
    // If DB not migrated yet, fail soft.
    res.json([]);
  }
});

// Admin: list & toggle any app feature
router.get(
  '/admin/app-features',
  authenticate,
  requireRole('admin', 'moderator'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT key, label, is_active, updated_at FROM app_features ORDER BY key`,
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

router.put(
  '/admin/app-features/:key',
  authenticate,
  requireRole('admin', 'moderator'),
  async (req: AuthRequest, res: Response) => {
    const { key } = req.params;
    const { is_active } = req.body as { is_active?: boolean };
    if (typeof is_active !== 'boolean') {
      res.status(400).json({ error: 'is_active must be boolean' });
      return;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO app_features (key, label, is_active, updated_at)
         VALUES ($1, '', $2, NOW())
         ON CONFLICT (key) DO UPDATE
           SET is_active = EXCLUDED.is_active,
               updated_at = NOW()
         RETURNING key, is_active`,
        [key, is_active],
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

router.post(
  '/admin/app-features/disable-all',
  authenticate,
  requireRole('admin', 'moderator'),
  async (_req: AuthRequest, res: Response) => {
    try {
      await pool.query(`UPDATE app_features SET is_active = false, updated_at = NOW()`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// ── Check access to one specific feature ─────────────────────────────────────
// GET /api/v1/billing/features/:key/access
router.get('/features/:key/access', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const info = await hasPremiumFeature(req.user!.id, req.params.key, req.user!.role);
    res.json(info);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── List Mauritanian banks ────────────────────────────────────────────────────
// GET /api/v1/billing/banks
router.get('/banks', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name_ar, name_fr, app_name FROM mauritanian_banks
       WHERE is_active = true ORDER BY id ASC`,
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── User submits a premium feature request (with screenshot) ──────────────────
// POST /api/v1/billing/feature-request
// Content-Type: multipart/form-data
//   screenshot  (file, required)
//   feature_key (string, required)
//   bank_name   (string, required)
//   amount_paid (number, optional)
//   note        (string, optional)
router.post(
  '/feature-request',
  authenticate,
  uploadScreenshot.single('screenshot'),
  async (req: AuthRequest, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file) {
        res.status(400).json({ error: 'يجب إرفاق صورة إيصال الدفع / Screenshot du paiement requis' });
        return;
      }

      const { feature_key, bank_name, topup_amount, note } = req.body as {
        feature_key:   string;
        bank_name:     string;
        topup_amount:  string; // MRU amount user wants to recharge
        note?:         string;
      };

      const topupMru = parseInt(topup_amount ?? '0');
      if (!feature_key || !bank_name) {
        fs.unlink(file.path, () => {});
        res.status(400).json({ error: 'feature_key and bank_name are required' });
        return;
      }
      if (!topupMru || topupMru < 50) {
        fs.unlink(file.path, () => {});
        res.status(400).json({ error: 'topup_amount minimum 50 MRU' });
        return;
      }

      // Check feature exists
      const { rows: feat } = await pool.query(
        `SELECT key FROM premium_features WHERE key = $1 AND is_active = true`,
        [feature_key],
      );
      if (!feat.length) {
        fs.unlink(file.path, () => {});
        res.status(404).json({ error: 'Feature not found or inactive' });
        return;
      }

      // Check no pending request already exists for this user+feature
      const { rows: existing } = await pool.query(
        `SELECT id FROM premium_feature_requests
         WHERE user_id = $1 AND feature_key = $2 AND status = 'pending'`,
        [req.user!.id, feature_key],
      );
      if (existing.length) {
        fs.unlink(file.path, () => {});
        res.status(409).json({
          error: 'لديك طلب قيد الانتظار لهذه الميزة / Vous avez déjà une demande en attente pour cette fonctionnalité',
        });
        return;
      }

      // Store relative path (served via /uploads static)
      const screenshotUrl = `/uploads/payment-screenshots/${file.filename}`;

      const { rows } = await pool.query(
        `INSERT INTO premium_feature_requests
           (user_id, feature_key, bank_name, screenshot_url, amount_paid_mru, topup_amount_mru, note)
         VALUES ($1, $2, $3, $4, $5, $5, $6)
         RETURNING id, feature_key, bank_name, screenshot_url, amount_paid_mru, topup_amount_mru, status, created_at`,
        [
          req.user!.id,
          feature_key,
          bank_name,
          screenshotUrl,
          topupMru,
          note ?? null,
        ],
      );

      res.status(201).json({ success: true, request: rows[0] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// ── User: get own requests history ────────────────────────────────────────────
// GET /api/v1/billing/feature-request/me
router.get('/feature-request/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.id, r.feature_key, r.bank_name, r.screenshot_url,
         r.amount_paid_mru, r.note, r.status, r.admin_note,
         r.created_at, r.reviewed_at,
         f.label_ar, f.label_fr, f.price_mru
       FROM premium_feature_requests r
       JOIN premium_features f ON f.key = r.feature_key
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user!.id],
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: list all feature requests ─────────────────────────────────────────
// GET /api/v1/billing/feature-requests?status=pending&page=1&limit=20
router.get(
  '/feature-requests',
  authenticate,
  requireRole('admin', 'moderator'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { status = 'pending', page = '1', limit = '20' } = req.query as Record<string, string>;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const params: unknown[] = [parseInt(limit), offset];
      let where = '';
      if (status && status !== 'all') {
        where = `WHERE r.status = '${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}'`;
      }

      const { rows } = await pool.query(
        `SELECT
           r.id, r.feature_key, r.bank_name, r.screenshot_url,
           r.amount_paid_mru, r.note, r.status, r.admin_note,
           r.created_at, r.reviewed_at,
           u.id AS user_id, u.full_name, u.email,
           f.label_ar, f.label_fr, f.price_mru, f.duration_days
         FROM premium_feature_requests r
         JOIN users u ON u.id = r.user_id
         JOIN premium_features f ON f.key = r.feature_key
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $1 OFFSET $2`,
        params,
      );

      const { rows: cnt } = await pool.query(
        `SELECT COUNT(*) FROM premium_feature_requests r ${where}`,
      );

      res.json({
        data:  rows,
        total: parseInt(cnt[0].count),
        page:  parseInt(page),
        limit: parseInt(limit),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// ── Admin: approve a request → grant premium access ───────────────────────────
// PUT /api/v1/billing/feature-requests/:id/approve
router.put(
  '/feature-requests/:id/approve',
  authenticate,
  requireRole('admin', 'moderator'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { admin_note } = req.body as { admin_note?: string };

      // Fetch the request
      const { rows } = await pool.query(
        `SELECT r.*, f.price_mru
         FROM premium_feature_requests r
         JOIN premium_features f ON f.key = r.feature_key
         WHERE r.id = $1`,
        [id],
      );
      if (!rows.length) { res.status(404).json({ error: 'Request not found' }); return; }
      const req_ = rows[0];

      if (req_.status !== 'pending') {
        res.status(409).json({ error: `Request is already ${req_.status}` });
        return;
      }

      // Mark as approved
      await pool.query(
        `UPDATE premium_feature_requests
         SET status = 'approved', admin_note = $1, reviewed_by = $2, reviewed_at = NOW()
         WHERE id = $3`,
        [admin_note ?? null, req.user!.id, id],
      );

      // Credit the user's wallet with the requested top-up amount
      const topupMru = req_.topup_amount_mru ?? req_.amount_paid_mru ?? req_.price_mru ?? 100;

      // Count previously approved requests for this user (BEFORE this approval)
      // Used to determine if this is the first top-up (triggers referral bonus)
      const { rows: prevRows } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM premium_feature_requests
         WHERE user_id = $1 AND status = 'approved' AND id != $2`,
        [req_.user_id, id],
      );
      const previouslyApprovedCount = parseInt(prevRows[0].cnt ?? '0');

      let access: Awaited<ReturnType<typeof topUpWallet>>;
      try {
        access = await topUpWallet(
          req_.user_id,
          req_.feature_key,
          topupMru,
          id,
        );
      } catch (e: any) {
        // Best effort: revert approval so admins can retry after fixing DB migrations.
        try {
          await pool.query(
            `UPDATE premium_feature_requests
             SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
             WHERE id = $1`,
            [id],
          );
        } catch {
          // ignore — don't mask original error
        }

        const pgCode = e?.code as string | undefined;
        const msg = String(e?.message ?? 'Unknown error');
        const migrationHint =
          pgCode === '42P01'
            ? 'Migration DB manquante: exécuter 024_payg_wallets.sql (tables wallets/transactions).'
            : pgCode === '42703'
              ? 'Migration DB manquante: exécuter 024_payg_wallets.sql (colonne topup_amount_mru).'
              : pgCode === '23514'
                ? 'Migration DB manquante: exécuter 030_feature_transactions_and_ara_chat_fix.sql (type referral_bonus).'
                : null;

        res.status(500).json({
          error: migrationHint ?? (msg.length < 140 ? msg : 'Erreur serveur lors du crédit du wallet'),
          code: pgCode ?? null,
        });
        return;
      }

      // ── Referral bonus: trigger only when ALL conditions are met ──────────
      // Condition 1: first top-up ever for this user (previouslyApprovedCount === 0)
      // Condition 2: deposit ≥ 50 MRU (checked inside creditReferralBonusIfEligible)
      // Condition 3: user was referred by someone (checked inside)
      // Condition 4: bonus not already paid (atomic UPDATE inside, prevents double-trigger)
      setImmediate(async () => {
        try {
          await creditReferralBonusIfEligible(
            req_.user_id,
            req_.feature_key,
            topupMru,
            previouslyApprovedCount,
          );
        } catch (e) {
          console.error('[referral] bonus credit failed:', e);
        }
      });

      console.log(`[billing] Admin ${req.user!.email} approved +${topupMru} MRU for feature "${req_.feature_key}" → user ${req_.user_id} (balance: ${access.balanceMru} MRU)`);

      res.json({ success: true, access, topupMru });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// ── Admin: reject a request ───────────────────────────────────────────────────
// PUT /api/v1/billing/feature-requests/:id/reject
router.put(
  '/feature-requests/:id/reject',
  authenticate,
  requireRole('admin', 'moderator'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { admin_note } = req.body as { admin_note?: string };

      const { rows } = await pool.query(
        `UPDATE premium_feature_requests
         SET status = 'rejected', admin_note = $1, reviewed_by = $2, reviewed_at = NOW()
         WHERE id = $3 AND status = 'pending'
         RETURNING id`,
        [admin_note ?? null, req.user!.id, id],
      );

      if (!rows.length) {
        res.status(404).json({ error: 'Request not found or already processed' });
        return;
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// WALLET ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

// ── Get all wallets for the current user ─────────────────────────────────────
// GET /api/v1/billing/wallet
router.get('/wallet', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows: features } = await pool.query(
      `SELECT key, label_ar, label_fr, cost_per_use_mru, min_recharge_mru
       FROM premium_features WHERE is_active = true ORDER BY sort_order`,
    );
    const { rows: wallets } = await pool.query(
      `SELECT feature_key, balance_mru, total_topped_up_mru, total_spent_mru
       FROM user_feature_wallets WHERE user_id = $1`,
      [req.user!.id],
    );
    const walletMap: Record<string, typeof wallets[0]> = {};
    for (const w of wallets) walletMap[w.feature_key] = w;

    const result = features.map(f => ({
      featureKey:      f.key,
      labelAr:         f.label_ar,
      labelFr:         f.label_fr,
      costPerUseMru:   f.cost_per_use_mru,
      minRechargeMru:  f.min_recharge_mru,
      balanceMru:      walletMap[f.key]?.balance_mru       ?? 0,
      totalToppedUpMru: walletMap[f.key]?.total_topped_up_mru ?? 0,
      totalSpentMru:   walletMap[f.key]?.total_spent_mru   ?? 0,
    }));

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get wallet + transaction history for one feature ─────────────────────────
// GET /api/v1/billing/wallet/:key/transactions?page=1&limit=20
router.get('/wallet/:key/transactions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { key } = req.params;
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const wallet = await getWallet(req.user!.id, key);

    const { rows: txs } = await pool.query(
      `SELECT id, amount_mru, type, description, created_at
       FROM feature_transactions
       WHERE user_id = $1 AND feature_key = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [req.user!.id, key, parseInt(limit), offset],
    );

    res.json({
      wallet: { featureKey: key, ...wallet },
      transactions: txs,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get all transactions for the current user ─────────────────────────────────
// GET /api/v1/billing/wallet/all-transactions?page=1&limit=50
router.get('/wallet/all-transactions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '50', feature_key } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE ft.user_id = $1';
    let params: any[] = [req.user!.id];

    // Filtrer par feature si spécifié
    if (feature_key) {
      whereClause += ' AND ft.feature_key = $2';
      params.push(feature_key);
      params.push(parseInt(limit));
      params.push(offset);
    } else {
      params.push(parseInt(limit));
      params.push(offset);
    }

    // Récupérer toutes les transactions avec les infos de feature
    const { rows: transactions } = await pool.query(
      `SELECT 
         ft.id, ft.feature_key, ft.amount_mru, ft.type, 
         ft.description, ft.created_at,
         pf.label_ar, pf.label_fr
       FROM feature_transactions ft
       JOIN premium_features pf ON ft.feature_key = pf.key
       ${whereClause}
       ORDER BY ft.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Compter le total
    const { rows: countResult } = await pool.query(
      `SELECT COUNT(*) as total
       FROM feature_transactions ft
       ${whereClause}`,
      [req.user!.id, ...(feature_key ? [feature_key] : [])],
    );

    // Grouper par feature pour la réponse
    const featureGroups: Record<string, any> = {};
    for (const tx of transactions) {
      if (!featureGroups[tx.feature_key]) {
        featureGroups[tx.feature_key] = {
          featureKey: tx.feature_key,
          labelAr: tx.label_ar,
          labelFr: tx.label_fr,
          transactions: []
        };
      }
      featureGroups[tx.feature_key].transactions.push({
        id: tx.id,
        amount_mru: tx.amount_mru,
        type: tx.type,
        description: tx.description,
        created_at: tx.created_at
      });
    }

    res.json({
      featureGroups: Object.values(featureGroups),
      transactions: transactions,  // Liste plate pour compatibilité
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult[0].total),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit))
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: manually credit a user's wallet ────────────────────────────────────
// POST /api/v1/billing/wallet/credit  { userId, featureKey, amountMru, note }
router.post(
  '/wallet/credit',
  authenticate,
  requireRole('admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId, featureKey, amountMru, note } = req.body as {
        userId: string; featureKey: string; amountMru: number; note?: string;
      };
      if (!userId || !featureKey || !amountMru || amountMru < 1) {
        res.status(400).json({ error: 'userId, featureKey, amountMru (≥1) required' });
        return;
      }
      // Insert transaction directly (admin manual credit)
      await pool.query(
        `INSERT INTO user_feature_wallets (user_id, feature_key, balance_mru, total_topped_up_mru)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (user_id, feature_key) DO UPDATE
           SET balance_mru         = user_feature_wallets.balance_mru + $3,
               total_topped_up_mru = user_feature_wallets.total_topped_up_mru + $3`,
        [userId, featureKey, amountMru],
      );
      await pool.query(
        `INSERT INTO feature_transactions (user_id, feature_key, amount_mru, type, description)
         VALUES ($1, $2, $3, 'topup', $4)`,
        [userId, featureKey, amountMru, note ?? `Crédit manuel par admin`],
      );
      const wallet = await getWallet(userId, featureKey);
      res.json({ success: true, wallet });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// ── GET /billing/admin/pricing ────────────────────────────────────────────────
// Admin: list all features with their pricing config (billing_unit + cost_per_unit_mru)

router.get(
  '/admin/pricing',
  authenticate,
  requireRole('admin'),
  async (_req, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT key, label_ar, label_fr, description_ar, cost_per_use_mru, billing_unit, cost_per_unit_mru, min_recharge_mru
         FROM premium_features ORDER BY sort_order, key`,
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// ── PUT /billing/admin/pricing/:key ───────────────────────────────────────────
// Admin: update the pricing for a specific feature

const VALID_BILLING_UNITS = ['per_use', 'per_minute', 'per_card', 'per_100_chars'];

router.put(
  '/admin/pricing/:key',
  authenticate,
  requireRole('admin'),
  async (req, res: Response) => {
    const { key } = req.params;
    const { cost_per_unit_mru, billing_unit } = req.body as {
      cost_per_unit_mru?: number;
      billing_unit?: string;
    };

    if (billing_unit && !VALID_BILLING_UNITS.includes(billing_unit)) {
      res.status(400).json({ error: `billing_unit must be one of: ${VALID_BILLING_UNITS.join(', ')}` });
      return;
    }
    if (cost_per_unit_mru !== undefined && (typeof cost_per_unit_mru !== 'number' || cost_per_unit_mru < 0)) {
      res.status(400).json({ error: 'cost_per_unit_mru must be a non-negative number' });
      return;
    }

    try {
      const { rows } = await pool.query(
        `UPDATE premium_features
         SET cost_per_unit_mru = COALESCE($1, cost_per_unit_mru),
             billing_unit       = COALESCE($2, billing_unit)
         WHERE key = $3
         RETURNING key, name, billing_unit, cost_per_unit_mru, min_recharge_mru`,
        [cost_per_unit_mru ?? null, billing_unit ?? null, key],
      );
      if (!rows.length) { res.status(404).json({ error: 'Feature not found' }); return; }
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

export default router;
