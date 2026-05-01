import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import pool from './db/pool';
import { authenticate } from './middleware/auth';
import { securityLogger } from './middleware/securityLogger';

import authRoutes       from './routes/auth';
import resourceRoutes   from './routes/resources';
import timetableRoutes  from './routes/timetable';
import remindersRoutes  from './routes/reminders';
import adminRoutes      from './routes/admin';
import flashcardsRoutes from './routes/flashcards';
import homeRoutes       from './routes/home';
import jobsRoutes       from './routes/jobs';
import opportunitiesRoutes from './routes/opportunities';
import xpRoutes         from './routes/xp';
import examRoutes       from './routes/exam-mode';
import billingRoutes    from './routes/billing';
import housingRoutes        from './routes/housing';
import dailyChallengeRoutes from './routes/daily-challenge';
import voiceNotesRoutes     from './routes/voiceNotes';
import aiRoutes             from './routes/ai';
import forumRoutes          from './routes/forum';
import academicStructureRoutes from './routes/academicStructure';
import entitlementsRoutes from './routes/entitlements';
import { parseCommaSeparatedEnv } from './utils/env';

const ENV = process.env.NODE_ENV || 'development';

const PRODUCTION_WEB_ORIGINS = new Set([
  'https://admin.studara.app',
  'https://studara.app',
  // VPS direct access (admin panel served by same nginx as API)
  'http://5.189.153.144',
  'https://5.189.153.144',
  'http://radar-mr.com',
  'https://radar-mr.com',
  'https://api.radar-mr.com',
  'https://www.radar-mr.com',
]);

// Optional: add extra allowed web origins without changing code.
// Comma-separated list. Example:
// CORS_ORIGINS=https://admin.my-domain.com,https://staging.my-domain.com
for (const o of parseCommaSeparatedEnv(process.env.CORS_ORIGINS)) {
  PRODUCTION_WEB_ORIGINS.add(o);
}

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (ENV !== 'production') {
      callback(null, true);
      return;
    }
    // Apps natives (React Native / Capacitor) n’envoient souvent pas d’en-tête Origin.
    if (!origin) {
      callback(null, true);
      return;
    }
    if (PRODUCTION_WEB_ORIGINS.has(origin)) {
      callback(null, true);
      return;
    }
    // Expo Go / tunnels de dev
    if (/^https:\/\/(.*\.)?exp\.direct$/i.test(origin)) {
      callback(null, true);
      return;
    }
    if (origin.startsWith('capacitor://') || origin.startsWith('ionic://')) {
      callback(null, true);
      return;
    }
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));

// Skip rate limiting in test environment (avoids flaky 429s in tests)
if (ENV !== 'test') {
  // Global limit — generous baseline
  app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
  // Auth routes — strict to prevent brute-force
  app.use('/api/v1/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
  // Per-route limits (override global — more generous for active endpoints)
  app.use('/api/v1/resources', rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1/flashcards', rateLimit({ windowMs: 15 * 60 * 1000, max: 400, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1/jobs', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1/opportunities', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1/home', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
  // Upload endpoint — stricter to prevent abuse (excludes like/bookmark/download/flashcards — not uploads)
  const uploadRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'حدّ الرفع: 10 ملفات في الساعة' } });
  app.use('/api/v1/resources', (req, _res, next) => {
    if (req.method === 'POST' && !req.path.includes('/like') && !req.path.includes('/bookmark') && !req.path.includes('/download') && !req.path.includes('/flashcards')) {
      uploadRateLimit(req, _res, next);
    } else { next(); }
  });
  // Voice notes — 50 uploads/heure
  app.use('/api/v1/voice-notes', rateLimit({ windowMs: 60 * 60 * 1000, max: 200, message: { error: 'حدّ التسجيل: 200 تسجيلاً في الساعة' } }));
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(securityLogger); // log 401 / 403 / 429 to PM2 stderr
app.use('/uploads', authenticate, express.static(path.join(__dirname, '../uploads')));

app.use('/api/v1/auth',       authRoutes);
app.use('/api/v1/billing',    billingRoutes);
app.use('/api/v1/resources',  resourceRoutes);
app.use('/api/v1/timetable',  timetableRoutes);
app.use('/api/v1/reminders',  remindersRoutes);
app.use('/api/v1/admin',      adminRoutes);
app.use('/api/v1/flashcards', flashcardsRoutes);
app.use('/api/v1/home',       homeRoutes);
app.use('/api/v1/jobs',       jobsRoutes);
app.use('/api/v1/opportunities', opportunitiesRoutes);
app.use('/api/v1/xp',         xpRoutes);
app.use('/api/v1/exams',      examRoutes);
app.use('/api/v1/housing',          housingRoutes);
app.use('/api/v1/daily-challenge',  dailyChallengeRoutes);
app.use('/api/v1/voice-notes',      voiceNotesRoutes);
app.use('/api/v1/ai',               aiRoutes);
app.use('/api/v1/forum',              forumRoutes);
app.use('/api/v1/academic-structure', academicStructureRoutes);
app.use('/api/v1',                    entitlementsRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
// GET /api/v1/faculties — public, no auth required, used by mobile app
app.get('/api/v1/faculties', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT slug, name_fr, name_ar, icon, sort_order
       FROM faculties
       WHERE is_active = TRUE
       ORDER BY sort_order, name_fr`
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/health', async (_req: Request, res: Response) => {
  const client = await pool.connect().catch(() => null);
  if (!client) {
    res.status(503).json({ status: 'db_unavailable', ts: new Date().toISOString() });
    return;
  }
  client.release();
  const summaryGroq = (process.env.SUMMARY_AI_GROQ_API_KEY ?? '').trim();
  res.json({
    status: 'ok',
    version: '1.0.0',
    /** Indique que le code « résumé cours » dédié SUMMARY_AI_GROQ_API_KEY est déployé. */
    ai_summary: {
      route: 'POST /api/v1/ai/resources/:id/summary',
      dedicated_env: 'SUMMARY_AI_GROQ_API_KEY',
      configured: summaryGroq.length > 0,
    },
    env: ENV,
    ts: new Date().toISOString(),
    pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: ENV === 'production' ? 'Internal Server Error' : err.message,
  });
});

export default app;
