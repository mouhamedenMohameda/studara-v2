import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';
import { awardXP } from '../services/xpService';

const router = Router();

// ─── GET /api/v1/xp  ──────────────────────────────────────────────────────────
// Returns current user's xp, level, streak + earned badges
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const [userRow, badgesRow] = await Promise.all([
      pool.query(
        `SELECT xp, level, streak_days, last_active_date FROM users WHERE id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT b.id, b.slug, b.name_fr, b.name_ar, b.emoji, b.color, ub.earned_at
         FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1
         ORDER BY ub.earned_at DESC`,
        [userId]
      ),
    ]);

    const u = userRow.rows[0] ?? { xp: 0, level: 1, streak_days: 0, last_active_date: null };
    res.json({
      xp:             parseInt(u.xp,           10),
      level:          parseInt(u.level,         10),
      streakDays:     parseInt(u.streak_days,   10),
      lastActiveDate: u.last_active_date,
      badges: badgesRow.rows.map(b => ({
        id:       b.id,
        slug:     b.slug,
        nameFr:   b.name_fr,
        nameAr:   b.name_ar,
        emoji:    b.emoji,
        color:    b.color,
        earnedAt: b.earned_at,
      })),
    });
  } catch (err) {
    console.error('[xp/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/v1/xp/badges  ───────────────────────────────────────────────────
// All badges with earned status for the current user
router.get('/badges', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const rows = await pool.query(
      `SELECT b.id, b.slug, b.name_fr, b.name_ar, b.emoji, b.color,
              b.condition_type, b.threshold, b.xp_reward,
              b.description_fr, b.description_ar,
              ub.earned_at
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = $1
       WHERE b.is_active = TRUE
       ORDER BY ub.earned_at DESC NULLS LAST, b.threshold ASC`,
      [userId]
    );
    res.json(
      rows.rows.map(b => ({
        id:            b.id,
        slug:          b.slug,
        nameFr:        b.name_fr,
        nameAr:        b.name_ar,
        emoji:         b.emoji,
        color:         b.color,
        descriptionFr: b.description_fr,
        descriptionAr: b.description_ar,
        conditionType: b.condition_type,
        threshold:     b.threshold,
        xpReward:      parseInt(b.xp_reward, 10),
        earned:        b.earned_at !== null,
        earnedAt:      b.earned_at,
      }))
    );
  } catch (err) {
    console.error('[xp/badges]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/v1/xp/leaderboard  ─────────────────────────────────────────────
router.get('/leaderboard', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await pool.query(
      `SELECT id, full_name, xp, level, total_uploads
       FROM users
       ORDER BY xp DESC
       LIMIT 10`
    );
    res.json(
      rows.rows.map(r => ({
        id:           r.id,
        fullName:     r.full_name,
        xp:           parseInt(r.xp, 10),
        level:        parseInt(r.level, 10),
        totalUploads: parseInt(r.total_uploads, 10),
      }))
    );
  } catch (err) {
    console.error('[xp/leaderboard]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/v1/xp/award  ───────────────────────────────────────────────────
// Award XP for an event; auto-grants earned badges with bonus XP
router.post('/award', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { eventType, xpGained = 0, meta } = req.body as {
    eventType: string;
    xpGained: number;
    meta?: Record<string, unknown>;
  };

  if (!eventType) {
    res.status(400).json({ error: 'eventType required' });
    return;
  }

  const client = await pool.connect();
  try {
    const result = await awardXP(userId, eventType, xpGained, meta);
    res.json({ ok: true, newBadges: result.newBadges });
  } catch (err) {
    console.error('[xp/award]', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

export default router;
