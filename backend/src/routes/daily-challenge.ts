/**
 * Daily Challenge Route — /api/v1/daily-challenge
 *
 * Wordle-style: every student in the same faculty gets IDENTICAL questions
 * each day, seeded by (UTC date + faculty).  Leaderboard resets at midnight.
 *
 * Endpoints:
 *   GET  /           — today's 5 questions (MCQ) for the caller's faculty
 *   POST /submit     — record score (once per day per user)
 *   GET  /leaderboard — top-10 for today × faculty
 */

import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const WINDOW_SECONDS = 5 * 60; // challenge is open for 5 minutes
const DEFAULT_TIME_LIMIT_S = 5 * 60;
const SUBMIT_GRACE_SECONDS = 15; // allow weak connection retries after window ends

type PublicDailyChallengeQuestion = {
  id?: string;
  front: string;
  options: string[];
  subject?: string;
};

function toPublicQuestion(q: any): PublicDailyChallengeQuestion {
  // Never expose any "correct answer" fields to clients.
  // Admin-authored sets may use `correct_answer`; seeded fallback uses `correctAnswer`.
  return {
    id: typeof q?.id === 'string' ? q.id : undefined,
    front: String(q?.front ?? ''),
    options: Array.isArray(q?.options) ? q.options.map(String) : [],
    subject: typeof q?.subject === 'string' ? q.subject : '',
  };
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getUtcMinutesNow(): number {
  const nowUtc = new Date();
  return nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes();
}

function toUtcDateTimeISO(todayYYYYMMDD: string, hour: number, minute: number): string {
  // Build an ISO string representing today at HH:MM:00Z
  return new Date(`${todayYYYYMMDD}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`).toISOString();
}

// ─── Deterministic seeded shuffle ─────────────────────────────────────────────
function seededHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = seededHash(seed + String(i)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Fallback question bank (used when DB has < 8 flashcards) ─────────────────
const FALLBACK_QUESTIONS: { front: string; back: string; subject: string }[] = [
  { front: 'ما هي وحدة قياس القوة في النظام الدولي؟', back: 'نيوتن (N)', subject: 'الفيزياء' },
  { front: 'ما هو عدد الإلكترونات في ذرة الكربون؟', back: '6 إلكترونات', subject: 'الكيمياء' },
  { front: 'ما هي عاصمة موريتانيا؟', back: 'نواكشوط', subject: 'الجغرافيا' },
  { front: 'ما هو مشتق دالة sin(x)؟', back: 'cos(x)', subject: 'الرياضيات' },
  { front: 'كم يبلغ مجموع زوايا المثلث؟', back: '180 درجة', subject: 'الرياضيات' },
  { front: 'ما هو رمز العنصر الكيميائي للذهب؟', back: 'Au', subject: 'الكيمياء' },
  { front: 'ما هي قانون أوم؟', back: 'V = R × I', subject: 'الفيزياء' },
  { front: 'ما هو تعريف الخلية في علم الأحياء؟', back: 'الوحدة الأساسية للحياة', subject: 'الأحياء' },
  { front: 'من كتب رواية "الأيام"؟', back: 'طه حسين', subject: 'الأدب العربي' },
  { front: 'Quelle est la dérivée de ln(x)?', back: '1/x', subject: 'Mathématiques' },
  { front: 'Quelle est la formule de l\'eau?', back: 'H₂O', subject: 'Chimie' },
  { front: 'Quel est le théorème de Pythagore?', back: 'a² + b² = c²', subject: 'Mathématiques' },
  { front: 'Quelle est la vitesse de la lumière dans le vide?', back: '3×10⁸ m/s', subject: 'Physique' },
  { front: 'Qu\'est-ce que la photosynthèse?', back: 'Conversion de CO₂ + H₂O en glucose grâce à la lumière', subject: 'Biologie' },
  { front: 'ما هو أكبر كوكب في المجموعة الشمسية؟', back: 'المشتري', subject: 'الفلك' },
  { front: 'ما هي أسرع قارة في النمو الاقتصادي؟', back: 'آسيا', subject: 'الاقتصاد' },
  { front: 'ما هو العنصر الأوفر في الغلاف الجوي للأرض؟', back: 'النيتروجين (78%)', subject: 'الكيمياء' },
  { front: 'كم عدد عظام الجسم البشري البالغ؟', back: '206 عظمة', subject: 'الأحياء' },
  { front: 'ما قيمة π (باي) تقريباً؟', back: '3.14159', subject: 'الرياضيات' },
  { front: 'Quel est l\'organe qui pompe le sang?', back: 'Le cœur', subject: 'Biologie' },
];

// ─── GET /api/v1/daily-challenge ──────────────────────────────────────────────
// Returns 5 MCQ questions seeded by (today + faculty) — same for all users
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today  = utcToday(); // 'YYYY-MM-DD'
  const nowUtcTotalMinutes = getUtcMinutesNow();

  try {
    // Get user's faculty
    const { rows: userRows } = await pool.query(
      `SELECT faculty FROM users WHERE id = $1`,
      [userId],
    );
    const faculty: string = (userRows[0]?.faculty ?? 'all').toLowerCase();

    // ── 1. Check for admin-authored set (faculty-specific first, then 'all') ──
    const { rows: adminSets } = await pool.query(
      `SELECT * FROM daily_challenge_sets
       WHERE challenge_date = $1
         AND faculty = ANY($2::text[])
         AND is_active = TRUE
       ORDER BY (faculty = $3) DESC   -- prefer faculty-specific over 'all'
       LIMIT 1`,
      [today, [faculty, 'all'], faculty],
    );

    let useAdminSet = false;
    let adminSet: any = null;
    if (adminSets.length > 0) {
      adminSet = adminSets[0];
      const setTotalMinutes = (adminSet.show_from_hour ?? 0) * 60 + (adminSet.show_from_minute ?? 0);
      if (nowUtcTotalMinutes >= setTotalMinutes) {
        useAdminSet = true;
      }
    }

    const showFromHour = adminSet?.show_from_hour ?? 0;
    const showFromMinute = adminSet?.show_from_minute ?? 0;
    const startAtIso = toUtcDateTimeISO(today, showFromHour, showFromMinute);
    const windowEndIso = new Date(new Date(startAtIso).getTime() + WINDOW_SECONDS * 1000).toISOString();
    const isClosed = new Date().toISOString() >= windowEndIso;

    // ── 2. If admin set exists but it's before show_from time → return countdown ──
    if (adminSets.length > 0 && !useAdminSet) {
      return res.json({
        date: today,
        faculty,
        questions: [],
        alreadySubmitted: false,
        myScore: null,
        notYetAvailable: true,
        closed:         false,
        showFromHour:   adminSet.show_from_hour,
        showFromMinute: adminSet.show_from_minute ?? 0,
        startAtUtc:     startAtIso,
        windowEndUtc:   windowEndIso,
        timeLimitS:     adminSet.time_limit_s ?? DEFAULT_TIME_LIMIT_S,
      });
    }

    // ── 3. Check if already submitted today ──
    const { rows: subRows } = await pool.query(
      `SELECT score, correct, total, time_taken_s FROM daily_challenge_scores
       WHERE user_id = $1 AND challenge_date = $2`,
      [userId, today],
    );
    const alreadySubmitted = subRows.length > 0;

    // If challenge is closed and user hasn't already submitted, deny participation.
    if (isClosed && !alreadySubmitted) {
      return res.json({
        date: today,
        faculty,
        questions: [],
        timeLimitS: adminSet?.time_limit_s ?? DEFAULT_TIME_LIMIT_S,
        alreadySubmitted: false,
        myScore: null,
        notYetAvailable: false,
        closed: true,
        showFromHour,
        showFromMinute,
        startAtUtc: startAtIso,
        windowEndUtc: windowEndIso,
        isAdminSet: useAdminSet,
      });
    }

    // ── 4. Build questions ─────────────────────────────────────────────────────
    let questions: any[];
    let timeLimitS = DEFAULT_TIME_LIMIT_S;

    if (useAdminSet) {
      // Admin-authored: use questions as-is (already MCQ with options)
      questions  = (adminSet.questions || []).map((q: any, i: number) => ({ ...q, id: typeof q?.id === 'string' ? q.id : `admin_${i}` }));
      timeLimitS = adminSet.time_limit_s ?? DEFAULT_TIME_LIMIT_S;
    } else {
      // Seeded random fallback
      const seed = today + ':' + faculty;

      const { rows: cardRows } = await pool.query(
        `SELECT f.id::text AS id, f.front, f.back, fd.subject
         FROM flashcards f
         JOIN flashcard_decks fd ON f.deck_id = fd.id
         WHERE length(f.front) > 3 AND length(f.back) > 0
           AND length(f.front) < 300
         ORDER BY f.id`,
      );

      let pool_cards = cardRows.length >= 20
        ? cardRows
        : [...cardRows, ...FALLBACK_QUESTIONS.map((q, i) => ({ id: `fb_${i}`, ...q }))];

      const shuffled = seededShuffle(pool_cards, seed);
      const chosen   = shuffled.slice(0, 5);

      questions = chosen.map((card, qi) => {
        const others    = shuffled.filter(c => c.id !== card.id).map(c => c.back);
        const wrongSeed = seed + String(qi);
        const wrongPool = seededShuffle(others, wrongSeed).slice(0, 3);
        const GENERIC   = ['لا شيء مما سبق', 'جميع ما سبق', 'غير معروف', 'لا ينطبق'];
        while (wrongPool.length < 3) wrongPool.push(GENERIC[wrongPool.length]);
        const options = seededShuffle([card.back, ...wrongPool], wrongSeed + 'opts');
        return {
          id:            card.id,
          front:         card.front,
          correctAnswer: card.back,
          options,
          subject:       (card as any).subject ?? '',
        };
      });
    }

    res.json({
      date: today,
      faculty,
      questions: (questions ?? []).map(toPublicQuestion),
      timeLimitS,
      alreadySubmitted,
      myScore:          alreadySubmitted ? subRows[0] : null,
      notYetAvailable:  false,
      closed:           false,
      showFromHour,
      showFromMinute,
      startAtUtc:       startAtIso,
      windowEndUtc:     windowEndIso,
      isAdminSet:       useAdminSet,
    });
  } catch (err) {
    console.error('[daily-challenge/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/v1/daily-challenge/start ───────────────────────────────────────
// Creates (or returns) the user's attempt for today. Must be within the 5-min window.
router.post('/start', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today  = utcToday();
  try {
    const { rows: userRows } = await pool.query(`SELECT faculty FROM users WHERE id = $1`, [userId]);
    const faculty: string = (userRows[0]?.faculty ?? 'all').toLowerCase();

    const { rows: adminSets } = await pool.query(
      `SELECT * FROM daily_challenge_sets
       WHERE challenge_date = $1
         AND faculty = ANY($2::text[])
         AND is_active = TRUE
       ORDER BY (faculty = $3) DESC
       LIMIT 1`,
      [today, [faculty, 'all'], faculty],
    );
    const adminSet = adminSets[0] ?? null;
    const showFromHour = adminSet?.show_from_hour ?? 0;
    const showFromMinute = adminSet?.show_from_minute ?? 0;
    const startAtIso = toUtcDateTimeISO(today, showFromHour, showFromMinute);
    const windowEndIso = new Date(new Date(startAtIso).getTime() + WINDOW_SECONDS * 1000).toISOString();

    const nowIso = new Date().toISOString();
    if (nowIso < startAtIso) {
      res.status(409).json({ error: 'not_yet_available', startAtUtc: startAtIso, windowEndUtc: windowEndIso });
      return;
    }
    if (nowIso >= windowEndIso) {
      res.status(409).json({ error: 'closed', startAtUtc: startAtIso, windowEndUtc: windowEndIso });
      return;
    }

    const timeLimitS = Math.max(10, Math.min(adminSet?.time_limit_s ?? DEFAULT_TIME_LIMIT_S, WINDOW_SECONDS));
    const remainingS = Math.max(1, Math.floor((new Date(windowEndIso).getTime() - new Date(nowIso).getTime()) / 1000));
    const effectiveLimitS = Math.min(timeLimitS, remainingS);

    const { rows } = await pool.query(
      `INSERT INTO daily_challenge_attempts (user_id, faculty, challenge_date, started_at, window_end_at, time_limit_s)
       VALUES ($1, $2, $3, NOW(), $4, $5)
       ON CONFLICT (user_id, challenge_date)
       DO UPDATE SET
         started_at   = LEAST(daily_challenge_attempts.started_at, EXCLUDED.started_at),
         window_end_at = EXCLUDED.window_end_at,
         time_limit_s  = EXCLUDED.time_limit_s
       RETURNING started_at, window_end_at, time_limit_s`,
      [userId, faculty, today, windowEndIso, effectiveLimitS],
    );

    res.json({
      ok: true,
      date: today,
      faculty,
      startedAtUtc: rows[0]?.started_at,
      windowEndUtc: rows[0]?.window_end_at,
      timeLimitS: rows[0]?.time_limit_s ?? effectiveLimitS,
    });
  } catch (err) {
    console.error('[daily-challenge/start]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/v1/daily-challenge/submit ──────────────────────────────────────
router.post('/submit', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today  = utcToday();
  const body: any = req.body || {};
  const incomingScore = body.score;
  const incomingCorrect = body.correct;
  const incomingTotal = body.total;
  const incomingTimeTakenS = body.timeTakenS ?? body.time_taken_s;
  const incomingAnswers = Array.isArray(body.answers) ? body.answers : null;

  try {
    // Get user's faculty
    const { rows: userRows } = await pool.query(
      `SELECT faculty FROM users WHERE id = $1`,
      [userId],
    );
    const faculty: string = (userRows[0]?.faculty ?? 'all').toLowerCase();

    // Must have started inside the daily window
    const { rows: attemptRows } = await pool.query(
      `SELECT started_at, window_end_at, time_limit_s
       FROM daily_challenge_attempts
       WHERE user_id = $1 AND challenge_date = $2`,
      [userId, today],
    );
    if (!attemptRows.length) {
      res.status(409).json({ error: 'must_start_first' });
      return;
    }
    const attempt = attemptRows[0];
    const now = new Date();
    const windowEnd = new Date(attempt.window_end_at);
    const graceEnd = new Date(windowEnd.getTime() + SUBMIT_GRACE_SECONDS * 1000);
    if (now > graceEnd) {
      res.status(409).json({ error: 'closed' });
      return;
    }

    // Compute server time taken
    const startedAt = new Date(attempt.started_at);
    const limitS = Math.max(10, Math.floor(Number(attempt.time_limit_s) || DEFAULT_TIME_LIMIT_S));
    // Important: if the user submits late (weak network), cap at windowEnd so no advantage.
    const effectiveSubmitAt = now.getTime() <= windowEnd.getTime() ? now : windowEnd;
    const serverTimeTakenS = Math.max(
      0,
      Math.min(limitS, Math.floor((effectiveSubmitAt.getTime() - startedAt.getTime()) / 1000)),
    );

    // Compute correct/score server-side if client provided answers
    let total: number = 5;
    let correct: number = 0;
    let score: number = 0;

    const calcServerScore = (c: number, timeTaken: number, totalTime: number) => {
      const base = c * 100;
      const timeLeft = Math.max(0, totalTime - timeTaken);
      const bonus = c > 0 ? Math.round((timeLeft / totalTime) * c * 40) : 0;
      return base + bonus;
    };

    if (incomingAnswers) {
      // Determine today's question set (admin set if active, otherwise seeded fallback)
      const nowUtcTotalMinutes = getUtcMinutesNow();
      const { rows: adminSets } = await pool.query(
        `SELECT * FROM daily_challenge_sets
         WHERE challenge_date = $1
           AND faculty = ANY($2::text[])
           AND is_active = TRUE
         ORDER BY (faculty = $3) DESC
         LIMIT 1`,
        [today, [faculty, 'all'], faculty],
      );
      let useAdminSet = false;
      let adminSet: any = null;
      if (adminSets.length > 0) {
        adminSet = adminSets[0];
        const setTotalMinutes = (adminSet.show_from_hour ?? 0) * 60 + (adminSet.show_from_minute ?? 0);
        if (nowUtcTotalMinutes >= setTotalMinutes) useAdminSet = true;
      }

      type InternalQ = { id: string; correct: string };
      let internal: InternalQ[] = [];

      if (useAdminSet) {
        const qs = (adminSet?.questions || []).map((q: any, i: number) => ({
          id: typeof q?.id === 'string' ? q.id : `admin_${i}`,
          correct: String(q?.correct_answer ?? ''),
        }));
        internal = qs;
      } else {
        const seed = today + ':' + faculty;
        const { rows: cardRows } = await pool.query(
          `SELECT f.id::text AS id, f.front, f.back, fd.subject
           FROM flashcards f
           JOIN flashcard_decks fd ON f.deck_id = fd.id
           WHERE length(f.front) > 3 AND length(f.back) > 0
             AND length(f.front) < 300
           ORDER BY f.id`,
        );
        const pool_cards = cardRows.length >= 20
          ? cardRows
          : [...cardRows, ...FALLBACK_QUESTIONS.map((q, i) => ({ id: `fb_${i}`, ...q }))];
        const shuffled = seededShuffle(pool_cards, seed);
        const chosen = shuffled.slice(0, 5);
        internal = chosen.map((c: any) => ({ id: String(c.id), correct: String(c.back) }));
      }

      const byId = new Map(internal.map(q => [q.id, q.correct]));
      total = internal.length || 5;
      correct = incomingAnswers.reduce((acc: number, a: any) => {
        const qid = String(a?.id ?? '');
        const ans = String(a?.answer ?? '');
        if (!qid) return acc;
        const corr = byId.get(qid);
        return corr != null && ans === corr ? acc + 1 : acc;
      }, 0);
      score = calcServerScore(correct, serverTimeTakenS, limitS);
    } else if (typeof incomingScore === 'number' && typeof incomingCorrect === 'number') {
      // Backward compatibility: accept legacy client-side scoring
      score = incomingScore;
      correct = incomingCorrect;
      total = typeof incomingTotal === 'number' ? incomingTotal : 5;
    } else {
      res.status(400).json({ error: 'answers[] is required (or score/correct for legacy clients)' });
      return;
    }

    await pool.query(
      `UPDATE daily_challenge_attempts
       SET submitted_at = $3
       WHERE user_id = $1 AND challenge_date = $2`,
      [userId, today, effectiveSubmitAt.toISOString()],
    );

    // Upsert — keep best (score) and fastest (time)
    await pool.query(
      `INSERT INTO daily_challenge_scores
         (user_id, faculty, challenge_date, score, correct, total, time_taken_s)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, challenge_date)
       DO UPDATE SET
         faculty      = EXCLUDED.faculty,
         score        = GREATEST(daily_challenge_scores.score, EXCLUDED.score),
         correct      = GREATEST(daily_challenge_scores.correct, EXCLUDED.correct),
         total        = EXCLUDED.total,
         time_taken_s = LEAST(daily_challenge_scores.time_taken_s, EXCLUDED.time_taken_s)`,
      [userId, faculty, today, score, correct, total, serverTimeTakenS],
    );

    res.json({ ok: true, score, correct, total, timeTakenS: serverTimeTakenS });
  } catch (err) {
    console.error('[daily-challenge/submit]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/v1/daily-challenge/winner ───────────────────────────────────────
// Returns today's best candidate (perfect 5/5 required) for the caller's faculty.
router.get('/winner', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today  = utcToday();
  try {
    const { rows: userRows } = await pool.query(`SELECT faculty FROM users WHERE id = $1`, [userId]);
    const faculty: string = (userRows[0]?.faculty ?? 'all').toLowerCase();

    const { rows } = await pool.query(
      `SELECT
         dcs.user_id,
         u.full_name,
         dcs.correct,
         dcs.total,
         dcs.time_taken_s,
         u.created_at,
         (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_id = dcs.user_id) AS referral_count
       FROM daily_challenge_scores dcs
       JOIN users u ON u.id = dcs.user_id
       WHERE dcs.challenge_date = $1
         AND dcs.faculty = $2
         AND dcs.correct = dcs.total
       ORDER BY
         dcs.time_taken_s ASC,
         u.created_at ASC,
         (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_id = dcs.user_id) DESC
       LIMIT 1`,
      [today, faculty],
    );

    if (!rows.length) {
      res.json({ date: today, faculty, winner: null });
      return;
    }

    const w = rows[0];
    res.json({
      date: today,
      faculty,
      winner: {
        userId: w.user_id,
        name: w.full_name,
        timeTakenS: w.time_taken_s,
        referralCount: w.referral_count,
      },
    });
  } catch (err) {
    console.error('[daily-challenge/winner]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Daily challenge prize workflow (winner payout) ────────────────────────────

router.get('/prize', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today = utcToday();
  try {
    const { rows: userRows } = await pool.query(`SELECT faculty FROM users WHERE id = $1`, [userId]);
    const faculty: string = (userRows[0]?.faculty ?? 'all').toLowerCase();

    const { rows: prizeRows } = await pool.query(
      `SELECT
         id,
         challenge_date,
         faculty,
         phone,
         provider,
         account_full_name,
         submitted_at,
         admin_proof_url,
         admin_proof_uploaded_at,
         user_confirmed_at,
         time_taken_s,
         referral_count
       FROM daily_challenge_prizes
       WHERE user_id = $1 AND challenge_date = $2`,
      [userId, today],
    );

    const { rows: winnerRows } = await pool.query(
      `SELECT
         dcs.user_id,
         u.full_name,
         dcs.time_taken_s,
         (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_id = dcs.user_id) AS referral_count
       FROM daily_challenge_scores dcs
       JOIN users u ON u.id = dcs.user_id
       WHERE dcs.challenge_date = $1
         AND dcs.faculty = $2
         AND dcs.correct = dcs.total
       ORDER BY
         dcs.time_taken_s ASC,
         u.created_at ASC,
         (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_id = dcs.user_id) DESC
       LIMIT 1`,
      [today, faculty],
    );

    const winner = winnerRows[0]
      ? {
          userId: winnerRows[0].user_id as string,
          name: winnerRows[0].full_name as string,
          timeTakenS: Number(winnerRows[0].time_taken_s ?? 0),
          referralCount: Number(winnerRows[0].referral_count ?? 0),
        }
      : null;

    res.json({
      date: today,
      faculty,
      winner,
      prize: prizeRows[0] ?? null,
      isWinner: !!winner && winner.userId === userId,
    });
  } catch (err) {
    console.error('[daily-challenge/prize:get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/prize', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today = utcToday();
  const phone = String(req.body?.phone ?? '').trim();
  const provider = String(req.body?.provider ?? '').trim().toLowerCase();
  const accountFullName = String(req.body?.accountFullName ?? '').trim();

  if (!phone || phone.length < 6 || phone.length > 30) {
    res.status(400).json({ error: 'phone is required' });
    return;
  }
  if (!['bankily', 'sedad', 'masrivi'].includes(provider)) {
    res.status(400).json({ error: 'provider must be bankily|sedad|masrivi' });
    return;
  }
  if (!accountFullName || accountFullName.length < 3 || accountFullName.length > 120) {
    res.status(400).json({ error: 'accountFullName is required' });
    return;
  }

  try {
    const { rows: userRows } = await pool.query(`SELECT faculty FROM users WHERE id = $1`, [userId]);
    const faculty: string = (userRows[0]?.faculty ?? 'all').toLowerCase();

    // Must be the winner today
    const { rows: winnerRows } = await pool.query(
      `SELECT dcs.user_id, dcs.time_taken_s,
         (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_id = dcs.user_id) AS referral_count
       FROM daily_challenge_scores dcs
       JOIN users u ON u.id = dcs.user_id
       WHERE dcs.challenge_date = $1
         AND dcs.faculty = $2
         AND dcs.correct = dcs.total
       ORDER BY
         dcs.time_taken_s ASC,
         u.created_at ASC,
         (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_id = dcs.user_id) DESC
       LIMIT 1`,
      [today, faculty],
    );

    if (!winnerRows.length || winnerRows[0].user_id !== userId) {
      res.status(403).json({ error: 'winner_only' });
      return;
    }

    // Create once; cannot modify after submission
    const { rows: existing } = await pool.query(
      `SELECT id, user_confirmed_at FROM daily_challenge_prizes WHERE user_id = $1 AND challenge_date = $2`,
      [userId, today],
    );
    if (existing.length) {
      res.status(409).json({ error: 'already_submitted' });
      return;
    }

    const timeTakenS = Number(winnerRows[0].time_taken_s ?? 0);
    const referralCount = Number(winnerRows[0].referral_count ?? 0);

    const { rows: inserted } = await pool.query(
      `INSERT INTO daily_challenge_prizes
         (user_id, faculty, challenge_date, phone, provider, account_full_name, time_taken_s, referral_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [userId, faculty, today, phone, provider, accountFullName, timeTakenS, referralCount],
    );

    res.status(201).json({ ok: true, id: inserted[0]?.id });
  } catch (err) {
    console.error('[daily-challenge/prize:post]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/prize/confirm', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today = utcToday();
  try {
    const { rowCount } = await pool.query(
      `UPDATE daily_challenge_prizes
       SET user_confirmed_at = NOW()
       WHERE user_id = $1 AND challenge_date = $2
         AND user_confirmed_at IS NULL
         AND admin_proof_url IS NOT NULL`,
      [userId, today],
    );
    if (!rowCount) {
      res.status(409).json({ error: 'cannot_confirm_yet' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[daily-challenge/prize:confirm]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/daily-challenge/prize/proof
// Returns the admin proof screenshot (requires auth; winner only)
router.get('/prize/proof', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today = utcToday();
  try {
    const { rows } = await pool.query(
      `SELECT admin_proof_url
       FROM daily_challenge_prizes
       WHERE user_id = $1 AND challenge_date = $2`,
      [userId, today],
    );
    const proof = rows[0]?.admin_proof_url as string | undefined;
    if (!proof) {
      res.status(404).json({ error: 'no_proof' });
      return;
    }

    const filename = path.basename(proof);
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filePath = path.join(uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'proof_not_found' });
      return;
    }

    res.sendFile(path.resolve(filePath));
  } catch (err) {
    console.error('[daily-challenge/prize:proof]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/v1/daily-challenge/leaderboard ─────────────────────────────────
router.get('/leaderboard', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today  = new Date().toISOString().slice(0, 10);

  try {
    // Get user's faculty for filtering
    const { rows: userRows } = await pool.query(
      `SELECT faculty FROM users WHERE id = $1`,
      [userId],
    );
    const faculty: string = (userRows[0]?.faculty ?? 'all').toLowerCase();

    const { rows } = await pool.query(
      `SELECT
         u.full_name,
         u.created_at,
         dcs.score,
         dcs.correct,
         dcs.total,
         dcs.time_taken_s,
         (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_id = dcs.user_id) AS referral_count,
         dcs.user_id = $1 AS is_me
       FROM daily_challenge_scores dcs
       JOIN users u ON u.id = dcs.user_id
       WHERE dcs.challenge_date = $2
         AND dcs.faculty = $3
       ORDER BY
         (dcs.correct = dcs.total) DESC,   -- only perfect scores compete for top
         dcs.correct DESC,
         dcs.time_taken_s ASC,
         u.created_at ASC,
         (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_id = dcs.user_id) DESC
       LIMIT 20`,
      [userId, today, faculty],
    );

    res.json({
      date: today,
      faculty,
      entries: rows.map((r, i) => ({
        rank:       i + 1,
        name:       r.full_name,
        score:      r.score,
        correct:    r.correct,
        total:      r.total,
        timeTaken:  r.time_taken_s,
        isMe:       r.is_me,
      })),
    });
  } catch (err) {
    console.error('[daily-challenge/leaderboard]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
