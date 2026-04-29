import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { authorizeFeature } from '../services/entitlements/authorizationService';
import { getBoosterDefinitions } from '../services/entitlements/catalogService';
import { resolveEffectiveEntitlements } from '../services/entitlements/entitlementResolver';
import {
  activateBoosterForUser,
  activateSubscriptionForUser,
  getMySubscriptionSnapshot,
  getPlanPriceCard,
  simulateUpgrade,
} from '../services/entitlements/subscriptionManagementService';
import {
  consumeQuota,
  createAdminQuotaCredit,
  getUsageSnapshot,
  releaseUsageByIdempotencyKey,
} from '../services/entitlements/usageCounterService';
import { CounterKey, FeatureKey } from '../services/entitlements/types';

const router = Router();

const FEATURE_KEYS: FeatureKey[] = ['chat_standard', 'chat_premium', 'pdf_ingest', 'ocr_scan', 'long_context_session'];
const COUNTER_KEYS: CounterKey[] = ['ai_messages', 'ocr_pages', 'pdf_analyses', 'premium_answers'];

// GET /api/v1/catalog/subscriptions
router.get('/catalog/subscriptions', async (_req, res: Response) => {
  try {
    const plans = await getPlanPriceCard();
    res.json(plans);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Server error' });
  }
});

// GET /api/v1/catalog/boosters
router.get('/catalog/boosters', async (_req, res: Response) => {
  try {
    const boosters = await getBoosterDefinitions(true);
    res.json(boosters);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Server error' });
  }
});

// GET /api/v1/me/subscription
router.get('/me/subscription', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getMySubscriptionSnapshot(req.user!.id, req.user!.role);
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

// GET /api/v1/me/entitlements
router.get('/me/entitlements', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = await resolveEffectiveEntitlements(req.user!.id, req.user!.role);
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

// GET /api/v1/me/usage
router.get('/me/usage', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getUsageSnapshot(req.user!.id, req.user!.role);
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

// POST /api/v1/features/authorize
router.post('/features/authorize', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { featureKey, context } = req.body as {
      featureKey?: FeatureKey;
      context?: Record<string, unknown>;
    };

    if (!featureKey || !FEATURE_KEYS.includes(featureKey)) {
      res.status(400).json({ error: `featureKey must be one of: ${FEATURE_KEYS.join(', ')}` });
      return;
    }

    const decision = await authorizeFeature({
      userId: req.user!.id,
      userRole: req.user!.role,
      featureKey,
      context: context as any,
    });
    res.json(decision);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

// POST /api/v1/usage/consume
router.post('/usage/consume', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { idempotencyKey, featureKey, items, metadata } = req.body as {
      idempotencyKey?: string;
      featureKey?: FeatureKey;
      items?: Array<{ counterKey: CounterKey; amount: number }>;
      metadata?: Record<string, unknown>;
    };

    if (!featureKey || !FEATURE_KEYS.includes(featureKey)) {
      res.status(400).json({ error: `featureKey must be one of: ${FEATURE_KEYS.join(', ')}` });
      return;
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      res.status(400).json({ error: 'idempotencyKey is required' });
      return;
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }
    for (const item of items) {
      if (!COUNTER_KEYS.includes(item.counterKey)) {
        res.status(400).json({ error: `counterKey must be one of: ${COUNTER_KEYS.join(', ')}` });
        return;
      }
      if (!Number.isFinite(item.amount) || item.amount <= 0) {
        res.status(400).json({ error: 'item.amount must be > 0' });
        return;
      }
    }

    const data = await consumeQuota(
      req.user!.id,
      {
        idempotencyKey,
        featureKey,
        items,
        metadata,
      },
      req.user!.role,
    );
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error', code: err.code ?? null });
  }
});

// POST /api/v1/usage/release
router.post('/usage/release', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { idempotencyKey, reason } = req.body as { idempotencyKey?: string; reason?: string };
    if (!idempotencyKey) {
      res.status(400).json({ error: 'idempotencyKey is required' });
      return;
    }
    const data = await releaseUsageByIdempotencyKey(req.user!.id, idempotencyKey, reason);
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

// POST /api/v1/subscription/simulate-upgrade
router.post('/subscription/simulate-upgrade', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { targetPlanCode } = req.body as { targetPlanCode?: string };
    if (!targetPlanCode) {
      res.status(400).json({ error: 'targetPlanCode is required' });
      return;
    }
    const data = await simulateUpgrade(req.user!.id, targetPlanCode);
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

// POST /api/v1/admin/credit
router.post('/admin/credit', authenticate, requireRole('admin', 'moderator'), async (req: AuthRequest, res: Response) => {
  try {
    const { userId, counterKey, amount, expiresAt, note } = req.body as {
      userId?: string;
      counterKey?: CounterKey;
      amount?: number;
      expiresAt?: string;
      note?: string;
    };

    if (!userId || !counterKey || !COUNTER_KEYS.includes(counterKey) || !amount || !expiresAt) {
      res.status(400).json({
        error: `userId, counterKey(${COUNTER_KEYS.join('|')}), amount and expiresAt are required`,
      });
      return;
    }

    const data = await createAdminQuotaCredit({
      userId,
      counterKey,
      amount,
      expiresAt,
      note,
      createdBy: req.user?.id,
    });
    res.json({ success: true, credit: data });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

// POST /api/v1/admin/subscription/activate
router.post('/admin/subscription/activate', authenticate, requireRole('admin', 'moderator'), async (req: AuthRequest, res: Response) => {
  try {
    const { userId, planCode, periodDays, timezone, source, providerRef } = req.body as {
      userId?: string;
      planCode?: string;
      periodDays?: number;
      timezone?: string;
      source?: 'payment' | 'admin' | 'migration' | 'promo';
      providerRef?: string;
    };

    if (!userId || !planCode) {
      res.status(400).json({ error: 'userId and planCode are required' });
      return;
    }

    const data = await activateSubscriptionForUser({
      userId,
      planCode,
      periodDays,
      timezone,
      source: source ?? 'admin',
      providerRef: providerRef ?? null,
    });
    res.json({ success: true, subscription: data });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

// POST /api/v1/boosters/activate
router.post('/boosters/activate', authenticate, requireRole('admin', 'moderator'), async (req: AuthRequest, res: Response) => {
  try {
    const { userId, boosterCode, source, providerRef } = req.body as {
      userId?: string;
      boosterCode?: string;
      source?: 'payment' | 'admin' | 'promo' | 'migration';
      providerRef?: string;
    };

    if (!userId || !boosterCode) {
      res.status(400).json({ error: 'userId and boosterCode are required' });
      return;
    }

    const data = await activateBoosterForUser({
      userId,
      boosterCode,
      source: source ?? 'admin',
      providerRef: providerRef ?? null,
    });
    res.json({ success: true, booster: data });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message ?? 'Server error' });
  }
});

export default router;

