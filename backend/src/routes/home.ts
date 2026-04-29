import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/home/summary
router.get('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86400000);

  try {
    const [dueCards, todayReminders, recentDecks, totalResources, userXp, nextExam] = await Promise.all([
      // Count all due flashcards across user's decks
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM flashcards fc
         JOIN flashcard_decks fd ON fc.deck_id = fd.id
         WHERE fd.user_id = $1 AND fc.next_review <= NOW()`,
        [userId]
      ),

      // Today's reminders (personal + approved global)
      pool.query(
        `SELECT id, title, reminder_type, scheduled_at, course_color
         FROM reminders
         WHERE scheduled_at >= $1 AND scheduled_at < $2
           AND is_completed = FALSE
           AND (
             (user_id = $3 AND scope = 'personal')
             OR (scope = 'global' AND status = 'approved')
           )
         ORDER BY scheduled_at ASC
         LIMIT 10`,
        [todayStart.toISOString(), todayEnd.toISOString(), userId]
      ),

      // 5 most recently studied / created decks with due count
      pool.query(
        `SELECT fd.id, fd.title, fd.color,
                COUNT(fc.id) FILTER (WHERE fc.next_review <= NOW()) AS due_count
         FROM flashcard_decks fd
         LEFT JOIN flashcards fc ON fc.deck_id = fd.id
         WHERE fd.user_id = $1
         GROUP BY fd.id
         ORDER BY fd.updated_at DESC
         LIMIT 5`,
        [userId]
      ),

      // Total approved resources uploaded by user
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM resources WHERE uploaded_by = $1 AND status = 'approved'`,
        [userId]
      ),

      // XP + streak for current user
      pool.query(
        `SELECT xp, level, streak_days FROM users WHERE id = $1`,
        [userId]
      ),

      // Next upcoming exam (not done, in future)
      pool.query(
        `SELECT subject, exam_date, color
         FROM exam_countdowns
         WHERE user_id = $1 AND is_done = FALSE AND exam_date >= CURRENT_DATE
         ORDER BY exam_date ASC
         LIMIT 1`,
        [userId]
      ),
    ]);

    const xpData = userXp.rows[0] ?? { xp: 0, level: 1, streak_days: 0 };
    const ne = nextExam.rows[0];
    const daysLeft = ne
      ? Math.max(0, Math.ceil((new Date(ne.exam_date).getTime() - Date.now()) / 86400000))
      : null;

    res.json({
      dueCards:       parseInt(dueCards.rows[0]?.count ?? '0', 10),
      todayReminders: todayReminders.rows.map(r => ({
        id:            r.id,
        title:         r.title,
        reminderType:  r.reminder_type,
        scheduledAt:   r.scheduled_at,
        courseColor:   r.course_color,
      })),
      recentDecks: recentDecks.rows.map(d => ({
        id:       d.id,
        title:    d.title,
        color:    d.color,
        dueCount: parseInt(d.due_count ?? '0', 10),
      })),
      totalResources: parseInt(totalResources.rows[0]?.count ?? '0', 10),
      xp:             parseInt(xpData.xp,          10),
      level:          parseInt(xpData.level,        10),
      streakDays:     parseInt(xpData.streak_days,  10),
      nextExam: ne ? {
        subject:  ne.subject,
        examDate: ne.exam_date,
        color:    ne.color,
        daysLeft,
      } : null,
    });
  } catch (err) {
    console.error('[home/summary]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
