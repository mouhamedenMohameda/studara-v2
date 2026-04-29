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
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

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
  const today  = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const nowUtc = new Date();
  const nowUtcHour   = nowUtc.getUTCHours();
  const nowUtcMinute = nowUtc.getUTCMinutes();
  const nowUtcTotalMinutes = nowUtcHour * 60 + nowUtcMinute;

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

    // ── 2. If admin set exists but it's before show_from time → return countdown ──
    if (adminSets.length > 0 && !useAdminSet) {
      return res.json({
        date: today,
        faculty,
        questions: [],
        alreadySubmitted: false,
        myScore: null,
        notYetAvailable: true,
        showFromHour:   adminSet.show_from_hour,
        showFromMinute: adminSet.show_from_minute ?? 0,
        timeLimitS:     adminSet.time_limit_s,
      });
    }

    // ── 3. Check if already submitted today ──
    const { rows: subRows } = await pool.query(
      `SELECT score, correct, total, time_taken_s FROM daily_challenge_scores
       WHERE user_id = $1 AND challenge_date = $2`,
      [userId, today],
    );
    const alreadySubmitted = subRows.length > 0;

    // ── 4. Build questions ─────────────────────────────────────────────────────
    let questions: any[];
    let timeLimitS = 60;

    if (useAdminSet) {
      // Admin-authored: use questions as-is (already MCQ with options)
      questions  = adminSet.questions;
      timeLimitS = adminSet.time_limit_s;
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
      questions,
      timeLimitS,
      alreadySubmitted,
      myScore:          alreadySubmitted ? subRows[0] : null,
      notYetAvailable:  false,
      showFromHour:     adminSet?.show_from_hour ?? 0,
      isAdminSet:       useAdminSet,
    });
  } catch (err) {
    console.error('[daily-challenge/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/v1/daily-challenge/submit ──────────────────────────────────────
router.post('/submit', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const today  = new Date().toISOString().slice(0, 10);
  const { score, correct, total = 5, time_taken_s } = req.body as {
    score: number;
    correct: number;
    total?: number;
    time_taken_s: number;
  };

  if (typeof score !== 'number' || typeof correct !== 'number') {
    res.status(400).json({ error: 'score and correct are required numbers' });
    return;
  }

  try {
    // Get user's faculty
    const { rows: userRows } = await pool.query(
      `SELECT faculty FROM users WHERE id = $1`,
      [userId],
    );
    const faculty: string = (userRows[0]?.faculty ?? 'all').toLowerCase();

    // Upsert — if they somehow call submit twice, keep the better score
    await pool.query(
      `INSERT INTO daily_challenge_scores
         (user_id, faculty, challenge_date, score, correct, total, time_taken_s)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, challenge_date)
       DO UPDATE SET
         score        = GREATEST(daily_challenge_scores.score, EXCLUDED.score),
         correct      = GREATEST(daily_challenge_scores.correct, EXCLUDED.correct),
         time_taken_s = LEAST(daily_challenge_scores.time_taken_s, EXCLUDED.time_taken_s)`,
      [userId, faculty, today, score, correct, total, time_taken_s],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[daily-challenge/submit]', err);
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
         dcs.score,
         dcs.correct,
         dcs.total,
         dcs.time_taken_s,
         dcs.user_id = $1 AS is_me
       FROM daily_challenge_scores dcs
       JOIN users u ON u.id = dcs.user_id
       WHERE dcs.challenge_date = $2
         AND dcs.faculty = $3
       ORDER BY dcs.score DESC, dcs.time_taken_s ASC
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
