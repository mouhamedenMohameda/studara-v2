/**
 * forum.ts — Forum / Q&A par matière  (#4)
 *
 *  GET    /forum/posts               — liste paginée des posts
 *  POST   /forum/posts               — créer un post
 *  GET    /forum/posts/:id           — détail + réponses
 *  DELETE /forum/posts/:id           — supprimer son post
 *  POST   /forum/posts/:id/upvote    — toggle upvote sur un post
 *  POST   /forum/posts/:id/replies   — ajouter une réponse
 *  POST   /forum/replies/:id/upvote  — toggle upvote sur une réponse
 *  PATCH  /forum/replies/:id/best    — marquer comme meilleure réponse (auteur du post seulement)
 */

import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';
import { awardXP } from '../services/xpService';

const router = Router();
router.use(authenticate);

// ─── GET /forum/posts ─────────────────────────────────────────────────────────

router.get('/posts', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = 20;
    const offset = (page - 1) * limit;
    const subject  = (req.query.subject  as string) || null;
    const faculty  = (req.query.faculty  as string) || null;
    const search   = (req.query.q        as string) || null;

    const conditions: string[] = [];
    const params: unknown[]    = [userId];
    const countParams: unknown[] = []; // separate params for COUNT — no $1 userId needed

    if (subject)  { conditions.push(`fp.subject = $${params.length + 1}`);                          params.push(subject); countParams.push(subject); }
    if (faculty)  { conditions.push(`fp.faculty = $${params.length + 1}`);                          params.push(faculty); countParams.push(faculty); }
    if (search)   { conditions.push(`(fp.title ILIKE $${params.length + 1} OR fp.body ILIKE $${params.length + 1})`); params.push(`%${search}%`); countParams.push(`%${search}%`); }

    const where      = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // COUNT query uses $1..$N for filter params only (no userId $1)
    const countWhere = countParams.length
      ? `WHERE ${conditions.map((c, i) => c.replace(/\$\d+/g, `$${i + 1}`)).join(' AND ')}`
      : '';

    const { rows } = await pool.query(
      `SELECT
         fp.id, fp.title, fp.body, fp.subject, fp.faculty,
         fp.upvotes, fp.replies_count, fp.created_at,
         u.full_name AS author_name,
         fp.user_id,
         EXISTS(SELECT 1 FROM forum_votes fv WHERE fv.user_id = $1 AND fv.target_type = 'post' AND fv.target_id = fp.id) AS is_upvoted,
         EXISTS(SELECT 1 FROM forum_replies fr WHERE fr.post_id = fp.id AND fr.is_best_answer = TRUE) AS has_best_answer
       FROM forum_posts fp
       JOIN users u ON u.id = fp.user_id
       ${where}
       ORDER BY fp.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const countRow = await pool.query(
      `SELECT COUNT(*) FROM forum_posts fp ${countWhere}`,
      countParams,
    );

    return res.json({
      posts: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        authorName: r.author_name,
        title: r.title,
        body: r.body,
        subject: r.subject,
        faculty: r.faculty,
        upvotes: r.upvotes,
        repliesCount: r.replies_count,
        isUpvoted: r.is_upvoted,
        hasBestAnswer: r.has_best_answer,
        createdAt: r.created_at,
      })),
      total: parseInt(countRow.rows[0].count),
      page,
      hasMore: offset + rows.length < parseInt(countRow.rows[0].count),
    });
  } catch (err: any) {
    console.error('[forum/posts GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /forum/posts ────────────────────────────────────────────────────────

router.post('/posts', async (req: AuthRequest, res: Response) => {
  try {
    const userId  = req.user!.id;
    const { title, body, subject, faculty } = req.body as {
      title: string; body: string; subject?: string; faculty?: string;
    };

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'title et body requis' });
    }
    if (title.length > 200) return res.status(400).json({ error: 'Titre trop long (max 200)' });

    const { rows } = await pool.query(
      `INSERT INTO forum_posts (user_id, title, body, subject, faculty)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, body, subject, faculty, upvotes, replies_count, created_at`,
      [userId, title.trim(), body.trim(), subject?.trim() || null, faculty?.trim() || null],
    );

    // Award XP for creating a post
    try { await awardXP(userId, 'forum_post', 5); } catch (_) {}

    const userRow = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [userId]);

    return res.status(201).json({
      ...rows[0],
      authorName: userRow.rows[0]?.full_name,
      repliesCount: 0,
      isUpvoted: false,
    });
  } catch (err: any) {
    console.error('[forum/posts POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /forum/posts/:id ─────────────────────────────────────────────────────

router.get('/posts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const postRows = await pool.query(
      `SELECT fp.*, u.full_name AS author_name,
         EXISTS(SELECT 1 FROM forum_votes fv WHERE fv.user_id = $2 AND fv.target_type = 'post' AND fv.target_id = fp.id) AS is_upvoted
       FROM forum_posts fp JOIN users u ON u.id = fp.user_id
       WHERE fp.id = $1`,
      [id, userId],
    );
    if (!postRows.rows.length) return res.status(404).json({ error: 'Post introuvable' });

    const repliesRows = await pool.query(
      `SELECT fr.*, u.full_name AS author_name,
         EXISTS(SELECT 1 FROM forum_votes fv WHERE fv.user_id = $2 AND fv.target_type = 'reply' AND fv.target_id = fr.id) AS is_upvoted
       FROM forum_replies fr JOIN users u ON u.id = fr.user_id
       WHERE fr.post_id = $1
       ORDER BY fr.is_best_answer DESC, fr.upvotes DESC, fr.created_at ASC`,
      [id, userId],
    );

    const p = postRows.rows[0];
    return res.json({
      post: {
        id: p.id, userId: p.user_id, authorName: p.author_name,
        title: p.title, body: p.body, subject: p.subject, faculty: p.faculty,
        upvotes: p.upvotes, repliesCount: p.replies_count,
        isUpvoted: p.is_upvoted, createdAt: p.created_at,
      },
      replies: repliesRows.rows.map(r => ({
        id: r.id, postId: r.post_id, userId: r.user_id, authorName: r.author_name,
        body: r.body, upvotes: r.upvotes, isBestAnswer: r.is_best_answer,
        isUpvoted: r.is_upvoted, createdAt: r.created_at,
      })),
    });
  } catch (err: any) {
    console.error('[forum/posts/:id GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /forum/posts/:id ──────────────────────────────────────────────────

router.delete('/posts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { rows } = await pool.query(`SELECT user_id FROM forum_posts WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post introuvable' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Non autorisé' });
    await pool.query(`DELETE FROM forum_posts WHERE id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /forum/posts/:id/upvote ─────────────────────────────────────────────

router.post('/posts/:id/upvote', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Check if already voted
    const existing = await pool.query(
      `SELECT 1 FROM forum_votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2`,
      [userId, id],
    );

    if (existing.rows.length) {
      // Remove vote
      await pool.query(`DELETE FROM forum_votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2`, [userId, id]);
      await pool.query(`UPDATE forum_posts SET upvotes = GREATEST(0, upvotes - 1) WHERE id = $1`, [id]);
      return res.json({ isUpvoted: false });
    } else {
      // Add vote
      await pool.query(`INSERT INTO forum_votes (user_id, target_type, target_id) VALUES ($1, 'post', $2)`, [userId, id]);
      await pool.query(`UPDATE forum_posts SET upvotes = upvotes + 1 WHERE id = $1`, [id]);
      // Award XP to post author
      const postOwner = await pool.query(`SELECT user_id FROM forum_posts WHERE id = $1`, [id]);
      if (postOwner.rows[0]?.user_id !== userId) {
        try { await awardXP(postOwner.rows[0].user_id, 'forum_upvote_received', 2); } catch (_) {}
      }
      return res.json({ isUpvoted: true });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /forum/posts/:id/replies ────────────────────────────────────────────

router.post('/posts/:id/replies', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: postId } = req.params;
    const { body } = req.body as { body: string };

    if (!body?.trim()) return res.status(400).json({ error: 'body requis' });

    // Verify post exists
    const postCheck = await pool.query(`SELECT id FROM forum_posts WHERE id = $1`, [postId]);
    if (!postCheck.rows.length) return res.status(404).json({ error: 'Post introuvable' });

    const { rows } = await pool.query(
      `INSERT INTO forum_replies (post_id, user_id, body) VALUES ($1, $2, $3)
       RETURNING id, post_id, user_id, body, upvotes, is_best_answer, created_at`,
      [postId, userId, body.trim()],
    );

    // Update replies_count
    await pool.query(`UPDATE forum_posts SET replies_count = replies_count + 1 WHERE id = $1`, [postId]);

    // Award XP
    try { await awardXP(userId, 'forum_reply', 3); } catch (_) {}

    const userRow = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [userId]);

    return res.status(201).json({
      ...rows[0],
      authorName: userRow.rows[0]?.full_name,
      isUpvoted: false,
      isBestAnswer: false,
    });
  } catch (err: any) {
    console.error('[forum/replies POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /forum/replies/:id/upvote ──────────────────────────────────────────

router.post('/replies/:id/upvote', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await pool.query(
      `SELECT 1 FROM forum_votes WHERE user_id = $1 AND target_type = 'reply' AND target_id = $2`,
      [userId, id],
    );

    if (existing.rows.length) {
      await pool.query(`DELETE FROM forum_votes WHERE user_id = $1 AND target_type = 'reply' AND target_id = $2`, [userId, id]);
      await pool.query(`UPDATE forum_replies SET upvotes = GREATEST(0, upvotes - 1) WHERE id = $1`, [id]);
      return res.json({ isUpvoted: false });
    } else {
      await pool.query(`INSERT INTO forum_votes (user_id, target_type, target_id) VALUES ($1, 'reply', $2)`, [userId, id]);
      await pool.query(`UPDATE forum_replies SET upvotes = upvotes + 1 WHERE id = $1`, [id]);
      return res.json({ isUpvoted: true });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /forum/replies/:id/best ───────────────────────────────────────────

router.patch('/replies/:id/best', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Get reply + verify caller is post author
    const { rows } = await pool.query(
      `SELECT fr.post_id, fp.user_id AS post_author_id, fr.user_id AS reply_author_id, fr.is_best_answer
       FROM forum_replies fr
       JOIN forum_posts fp ON fp.id = fr.post_id
       WHERE fr.id = $1`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Réponse introuvable' });
    if (rows[0].post_author_id !== userId) return res.status(403).json({ error: 'Seul l\'auteur du post peut choisir la meilleure réponse' });

    const newValue = !rows[0].is_best_answer;

    // Unmark all others first
    await pool.query(`UPDATE forum_replies SET is_best_answer = FALSE WHERE post_id = $1`, [rows[0].post_id]);

    if (newValue) {
      await pool.query(`UPDATE forum_replies SET is_best_answer = TRUE WHERE id = $1`, [id]);
      // Award XP to reply author
      try { await awardXP(rows[0].reply_author_id, 'forum_best_answer', 10); } catch (_) {}
    }

    return res.json({ isBestAnswer: newValue });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
