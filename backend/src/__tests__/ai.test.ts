/**
 * ai.test.ts — Tests for /api/v1/ai/chat, /ai/credits, /ai/usage-stats
 *
 * Tests:
 *  - POST /chat with each model (deepseek, gpt, ara)
 *  - Credit deduction logic
 *  - Quota exceeded (429)
 *  - GET /credits returns correct remaining balance
 *  - GET /usage-stats (admin only)
 *  - Non-admin blocked from usage-stats
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import pool from '../db/pool';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => ({
  __esModule: true,
  default: {
    query:   jest.fn(),
    connect: jest.fn(),
    end:     jest.fn(),
    totalCount: 0, idleCount: 0, waitingCount: 0,
  },
}));

// Mock all external AI fetch calls
global.fetch = jest.fn();

const mockQuery = pool.query as unknown as jest.Mock;
const mockFetch = global.fetch as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeToken = (role = 'student', id = 'user-123') =>
  jwt.sign({ sub: id, email: 'test@studara.app', role }, process.env.JWT_SECRET!);

const authHeader = (role = 'student', id = 'user-123') => ({
  Authorization: `Bearer ${makeToken(role, id)}`,
});

const mockAIResponse = (content: string) =>
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  } as any);

const mockAnthropicResponse = (content: string) =>
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ content: [{ text: content }] }),
  } as any);

const TODAY = new Date().toISOString().slice(0, 10);

/** Aucun abonnement actif dans `user_subscriptions` → branche legacy crédits. */
function mockCatalogSubscriptionNone() {
  mockQuery.mockResolvedValueOnce({ rows: [] });
}

const FUTURE_PAID = new Date(Date.now() + 30 * 864e5).toISOString();

/**
 * Ordre des `pool.query` pour POST /chat en mode legacy (après getActiveSubscription) :
 * paid_until puis crédits du jour puis (après IA) déduction.
 * Par défaut `paid_until` futur → quota journalier 300 (premium legacy, DeepSeek uniquement).
 */
function mockLegacyChatPreamble(
  creditsUsedRow: { credits_used: number } | null,
  freeTier = false,
) {
  mockQuery.mockResolvedValueOnce({ rows: [] }); // getChatModels → défauts si vide
  mockCatalogSubscriptionNone();
  mockQuery.mockResolvedValueOnce({ rows: [{ paid_until: freeTier ? null : FUTURE_PAID }] });
  mockQuery.mockResolvedValueOnce({ rows: creditsUsedRow ? [creditsUsedRow] : [] });
}

/** GET /credits legacy : subscription vide puis credit+user (Promise.all), puis ai_chat_model_config. */
function mockLegacyCreditsPreamble(creditsUsed: number | null, freeTier = false) {
  mockCatalogSubscriptionNone();
  mockQuery.mockResolvedValueOnce({ rows: creditsUsed != null ? [{ credits_used: creditsUsed }] : [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ paid_until: freeTier ? null : FUTURE_PAID }] });
  mockQuery.mockResolvedValueOnce({ rows: [] });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DEEPSEEK_API_KEY = 'sk-deepseek-test';
  process.env.GROQ_API_KEY = 'gsk_test_groq';
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
});

// ─── POST /api/v1/ai/chat ─────────────────────────────────────────────────────

describe('POST /api/v1/ai/chat', () => {
  const messages = [{ role: 'user', content: 'Explique la loi d\'Ohm' }];

  describe('model: deepseek (default, 1 crédit)', () => {
    it('retourne une réponse et déduit 1 crédit', async () => {
      mockLegacyChatPreamble(null);
      mockAIResponse('La loi d\'Ohm : U = R × I');         // DeepSeek call
      mockQuery.mockResolvedValueOnce({ rows: [] });        // credit deduction

      const res = await request(app)
        .post('/api/v1/ai/chat')
        .set(authHeader())
        .send({ messages, model: 'deepseek' });

      expect(res.status).toBe(200);
      expect(res.body.reply).toContain('Ohm');
      expect(res.body.creditsRemaining).toBe(299); // 300 - 1 (legacy premium)
    });

    it('fallback vers Groq si DeepSeek échoue', async () => {
      mockLegacyChatPreamble(null);
      // DeepSeek fails
      mockFetch.mockResolvedValueOnce({ ok: false, text: async () => 'rate limit' } as any);
      // Groq fallback succeeds
      mockAIResponse('Réponse via Groq fallback');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/ai/chat')
        .set(authHeader())
        .send({ messages, model: 'deepseek' });

      expect(res.status).toBe(200);
      expect(res.body.reply).toBeTruthy();
    });
  });

  describe('model: gpt / ara sans catalogue', () => {
    it('retourne 403 pour gpt (abonnement catalogue requis)', async () => {
      mockLegacyChatPreamble({ credits_used: 0 });

      const res = await request(app)
        .post('/api/v1/ai/chat')
        .set(authHeader())
        .send({ messages, model: 'gpt' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('subscription_required');
    });

    it('retourne 403 pour ara (abonnement catalogue requis)', async () => {
      mockLegacyChatPreamble({ credits_used: 0 });

      const res = await request(app)
        .post('/api/v1/ai/chat')
        .set(authHeader())
        .send({ messages, model: 'ara' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('subscription_required');
    });
  });

  describe('quota dépassé', () => {
    it('retourne 200 si un crédit restant suffit pour DeepSeek', async () => {
      mockLegacyChatPreamble({ credits_used: 299 });
      mockAIResponse('Réponse avec 1 crédit restant');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/ai/chat')
        .set(authHeader())
        .send({ messages, model: 'deepseek' });

      expect(res.status).toBe(200);
      expect(res.body.creditsRemaining).toBe(0);
    });

    it('retourne 429 si quota DeepSeek épuisé (0 crédit restant)', async () => {
      mockLegacyChatPreamble({ credits_used: 300 });

      const res = await request(app)
        .post('/api/v1/ai/chat')
        .set(authHeader())
        .send({ messages, model: 'deepseek' });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('quota_exceeded');
      expect(res.body.creditsRemaining).toBe(0);
      expect(res.body.dailyQuota).toBe(300);
    });
  });

  describe('validation', () => {
    it('retourne 400 si messages est vide', async () => {
      const res = await request(app)
        .post('/api/v1/ai/chat')
        .set(authHeader())
        .send({ messages: [], model: 'deepseek' });

      expect(res.status).toBe(400);
    });

    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .post('/api/v1/ai/chat')
        .send({ messages, model: 'deepseek' });

      expect(res.status).toBe(401);
    });

    it('utilise deepseek par défaut si model non fourni', async () => {
      mockLegacyChatPreamble(null);
      mockAIResponse('Réponse par défaut');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/ai/chat')
        .set(authHeader())
        .send({ messages });

      expect(res.status).toBe(200);
      expect(res.body.reply).toBeTruthy();
    });
  });
});

// ─── GET /api/v1/ai/credits ───────────────────────────────────────────────────

describe('GET /api/v1/ai/credits', () => {
  it('retourne les crédits restants pour aujourd\'hui', async () => {
    mockLegacyCreditsPreamble(45);

    const res = await request(app)
      .get('/api/v1/ai/credits')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.creditsUsed).toBe(45);
    expect(res.body.creditsRemaining).toBe(255);
    expect(res.body.dailyQuota).toBe(300);
    expect(res.body.date).toBe(TODAY);
    expect(Array.isArray(res.body.models)).toBe(false);
  });

  it('retourne 150 crédits si premier message de la journée', async () => {
    mockLegacyCreditsPreamble(null);

    const res = await request(app)
      .get('/api/v1/ai/credits')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.creditsUsed).toBe(0);
    expect(res.body.creditsRemaining).toBe(300);
  });

  it('ne retourne pas de détails modèles (anti-fuite)', async () => {
    mockLegacyCreditsPreamble(299);

    const res = await request(app)
      .get('/api/v1/ai/credits')
      .set(authHeader());

    expect(res.body.chatUnlimited).toBe(false);
    expect(res.body.models).toBeUndefined();
  });

  it('retourne 401 sans token', async () => {
    const res = await request(app).get('/api/v1/ai/credits');
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/v1/ai/usage-stats ───────────────────────────────────────────────

describe('GET /api/v1/ai/usage-stats', () => {
  const mockStats = {
    perUser: [
      { id: 'u1', email: 'a@b.com', full_name: 'Alice', total_credits: 250, active_days: 5, last_active: TODAY },
    ],
    daily: [{ date: TODAY, total_credits: 250, active_users: 1 }],
    summary: [{ total_users: 1, total_credits: 250, avg_credits_per_user_day: 50 }],
  };

  it('admin peut voir les stats', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: mockStats.perUser })
      .mockResolvedValueOnce({ rows: mockStats.daily })
      .mockResolvedValueOnce({ rows: mockStats.summary });

    const res = await request(app)
      .get('/api/v1/ai/usage-stats')
      .set(authHeader('admin'));

    expect(res.status).toBe(200);
    expect(res.body.perUser).toHaveLength(1);
    expect(res.body.summary.total_credits).toBe(250);
    expect(res.body.summary.estimated_cost_usd).toBeCloseTo(0.5, 1);
  });

  it('student bloqué (403)', async () => {
    const res = await request(app)
      .get('/api/v1/ai/usage-stats')
      .set(authHeader('student'));

    expect(res.status).toBe(403);
  });

  it('non authentifié bloqué (401)', async () => {
    const res = await request(app).get('/api/v1/ai/usage-stats');
    expect(res.status).toBe(401);
  });

  it('accepte le paramètre days', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_users: 0, total_credits: 0, avg_credits_per_user_day: 0 }] });

    const res = await request(app)
      .get('/api/v1/ai/usage-stats?days=30')
      .set(authHeader('admin'));

    expect(res.status).toBe(200);
    expect(res.body.summary.period_days).toBe(30);
  });
});
