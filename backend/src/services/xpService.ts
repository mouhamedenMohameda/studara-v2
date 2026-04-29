import pool from '../db/pool';

/**
 * Award XP to a user for a given event.
 * Also updates level, streak, checks badge conditions and grants earned badges.
 * Safe to call from any route — runs inside its own transaction.
 */
export async function awardXP(
  userId: string,
  eventType: string,
  xpGained: number,
  meta?: Record<string, unknown>,
): Promise<{ newBadges: string[] }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Log event
    await client.query(
      `INSERT INTO xp_events (user_id, event_type, xp_gained, meta)
       VALUES ($1, $2, $3, $4)`,
      [userId, eventType, xpGained, meta ? JSON.stringify(meta) : null],
    );

    // 2. Update XP + level + streak
    const today = new Date().toISOString().split('T')[0];
    await client.query(
      `UPDATE users
       SET xp              = xp + $2,
           level           = GREATEST(1, FLOOR((xp + $2)::float / 200)::int + 1),
           streak_days     = CASE
             WHEN last_active_date = ($3::date - INTERVAL '1 day')::date THEN streak_days + 1
             WHEN last_active_date = $3::date                             THEN streak_days
             ELSE 1
           END,
           last_active_date = $3::date
       WHERE id = $1`,
      [userId, xpGained, today],
    );

    // 3. Collect user metrics for badge checks
    const [userRow, cardRow] = await Promise.all([
      client.query(`SELECT xp, streak_days, total_uploads FROM users WHERE id = $1`, [userId]),
      client.query(
        `SELECT COALESCE(SUM(repetitions), 0) AS total_reviews
         FROM flashcards fc
         JOIN flashcard_decks fd ON fc.deck_id = fd.id
         WHERE fd.user_id = $1`,
        [userId],
      ),
    ]);

    const { xp, streak_days, total_uploads } = userRow.rows[0];
    const total_reviews = parseInt(cardRow.rows[0].total_reviews, 10);

    const conditionMap: Record<string, number> = {
      uploads_count:  parseInt(total_uploads, 10),
      streak_days:    parseInt(streak_days,   10),
      xp_total:       parseInt(xp,            10),
      cards_reviewed: total_reviews,
    };

    // 4. Find unearned eligible badges
    const eligibleBadges = await client.query(
      `SELECT id, slug, condition_type, threshold, xp_reward
       FROM badges
       WHERE is_active = TRUE
         AND id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)`,
      [userId],
    );

    let bonusXp = 0;
    const newBadges: string[] = [];

    for (const badge of eligibleBadges.rows) {
      const current = conditionMap[badge.condition_type as string] ?? 0;
      if (current >= badge.threshold) {
        await client.query(
          `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, badge.id],
        );
        bonusXp += parseInt(badge.xp_reward, 10);
        newBadges.push(badge.slug);
      }
    }

    // 5. Award badge-bonus XP if any
    if (bonusXp > 0) {
      await client.query(
        `UPDATE users SET xp = xp + $2 WHERE id = $1`,
        [userId, bonusXp],
      );
      await client.query(
        `INSERT INTO xp_events (user_id, event_type, xp_gained, meta)
         VALUES ($1, 'badge_reward', $2, $3)`,
        [userId, bonusXp, JSON.stringify({ badges: newBadges })],
      );
    }

    await client.query('COMMIT');
    return { newBadges };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
