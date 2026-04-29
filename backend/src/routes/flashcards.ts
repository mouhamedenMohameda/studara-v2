import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate); // all flashcard routes require auth

// ─── SM-2 Algorithm ───────────────────────────────────────────────────────────
// quality: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
function sm2(
  quality: number,
  repetitions: number,
  easeFactor: number,
  intervalDays: number,
): { interval: number; easeFactor: number; repetitions: number; nextReview: Date } {
  let newEF = easeFactor + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  let newInterval: number;
  let newReps: number;

  if (quality < 1) {
    // Again — full reset
    newReps = 0;
    newInterval = 1;
  } else {
    newReps = repetitions + 1;
    if (newReps === 1)      newInterval = 1;
    else if (newReps === 2) newInterval = 6;
    else                    newInterval = Math.round(intervalDays * newEF);
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return { interval: newInterval, easeFactor: newEF, repetitions: newReps, nextReview };
}

// ─── Helper: sync card_count on a deck ───────────────────────────────────────
async function syncCardCount(deckId: string) {
  await pool.query(
    `UPDATE flashcard_decks
     SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = $1),
         updated_at = NOW()
     WHERE id = $1`,
    [deckId],
  );
}

// ─── Schemas ──────────────────────────────────────────────────────────────────
const deckSchema = z.object({
  title:   z.string().min(1).max(200),
  subject: z.string().max(200).optional(),
  color:   z.string().max(20).optional(),
});

const cardSchema = z.object({
  front: z.string().min(1),
  back:  z.string().min(1),
});

const reviewSchema = z.object({
  quality: z.number().int().min(0).max(3), // 0=Again 1=Hard 2=Good 3=Easy
});

// ─── GET /decks — list my decks with due counts ───────────────────────────────
router.get('/decks', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { rows } = await pool.query(
    `SELECT
       d.*,
       COALESCE(due.cnt, 0)::int AS due_count
     FROM flashcard_decks d
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS cnt
       FROM flashcards f
       WHERE f.deck_id = d.id AND f.next_review <= NOW()
     ) due ON true
     WHERE d.user_id = $1
     ORDER BY d.updated_at DESC`,
    [userId],
  );
  res.json(rows);
});

// ─── POST /decks — create deck ────────────────────────────────────────────────
router.post('/decks', async (req: AuthRequest, res: Response) => {
  const parsed = deckSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { title, subject, color } = parsed.data;
  const userId = req.user!.id;

  const { rows } = await pool.query(
    `INSERT INTO flashcard_decks (user_id, title, subject, color)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, title, subject ?? null, color ?? '#8B5CF6'],
  );
  res.status(201).json(rows[0]);
});

// ─── GET /decks/:id — deck + all its cards ────────────────────────────────────
router.get('/decks/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const deck = await pool.query(
    `SELECT d.*,
       COALESCE((SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id AND f.next_review <= NOW()), 0)::int AS due_count
     FROM flashcard_decks d WHERE d.id = $1 AND d.user_id = $2`,
    [id, userId],
  );
  if (!deck.rows.length) { res.status(404).json({ error: 'Deck not found' }); return; }

  const cards = await pool.query(
    `SELECT * FROM flashcards WHERE deck_id = $1 ORDER BY created_at ASC`,
    [id],
  );

  res.json({ ...deck.rows[0], cards: cards.rows });
});

// ─── PUT /decks/:id — update deck ────────────────────────────────────────────
router.put('/decks/:id', async (req: AuthRequest, res: Response) => {
  const parsed = deckSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const userId = req.user!.id;
  const { id } = req.params;
  const { title, subject, color } = parsed.data;

  const { rows } = await pool.query(
    `UPDATE flashcard_decks
     SET title = COALESCE($1, title),
         subject = COALESCE($2, subject),
         color = COALESCE($3, color),
         updated_at = NOW()
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [title, subject, color, id, userId],
  );
  if (!rows.length) { res.status(404).json({ error: 'Deck not found' }); return; }
  res.json(rows[0]);
});

// ─── DELETE /decks/:id ────────────────────────────────────────────────────────
router.delete('/decks/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { rows } = await pool.query(
    `DELETE FROM flashcard_decks WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  if (!rows.length) { res.status(404).json({ error: 'Deck not found' }); return; }
  res.json({ deleted: true });
});

// ─── POST /decks/:id/cards — add a card ──────────────────────────────────────
router.post('/decks/:id/cards', async (req: AuthRequest, res: Response) => {
  const parsed = cardSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const userId = req.user!.id;
  const deckId = req.params.id;

  // Verify ownership
  const deck = await pool.query(
    `SELECT id FROM flashcard_decks WHERE id = $1 AND user_id = $2`,
    [deckId, userId],
  );
  if (!deck.rows.length) { res.status(404).json({ error: 'Deck not found' }); return; }

  const { rows } = await pool.query(
    `INSERT INTO flashcards (deck_id, front, back) VALUES ($1, $2, $3) RETURNING *`,
    [deckId, parsed.data.front, parsed.data.back],
  );
  await syncCardCount(deckId);
  res.status(201).json(rows[0]);
});

// ─── PUT /cards/:id — edit a card ────────────────────────────────────────────
router.put('/cards/:id', async (req: AuthRequest, res: Response) => {
  const parsed = cardSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const userId = req.user!.id;
  const { id } = req.params;

  // Verify ownership via join
  const { rows } = await pool.query(
    `UPDATE flashcards f SET
       front = COALESCE($1, f.front),
       back  = COALESCE($2, f.back)
     FROM flashcard_decks d
     WHERE f.id = $3 AND f.deck_id = d.id AND d.user_id = $4
     RETURNING f.*`,
    [parsed.data.front, parsed.data.back, id, userId],
  );
  if (!rows.length) { res.status(404).json({ error: 'Card not found' }); return; }
  res.json(rows[0]);
});

// ─── DELETE /cards/:id ────────────────────────────────────────────────────────
router.delete('/cards/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const { rows } = await pool.query(
    `DELETE FROM flashcards f
     USING flashcard_decks d
     WHERE f.id = $1 AND f.deck_id = d.id AND d.user_id = $2
     RETURNING f.deck_id`,
    [id, userId],
  );
  if (!rows.length) { res.status(404).json({ error: 'Card not found' }); return; }
  await syncCardCount(rows[0].deck_id);
  res.json({ deleted: true });
});

// ─── GET /decks/:id/due — cards due for study right now ──────────────────────
router.get('/decks/:id/due', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const deckId = req.params.id;

  const deck = await pool.query(
    `SELECT id FROM flashcard_decks WHERE id = $1 AND user_id = $2`,
    [deckId, userId],
  );
  if (!deck.rows.length) { res.status(404).json({ error: 'Deck not found' }); return; }

  const { rows } = await pool.query(
    `SELECT * FROM flashcards
     WHERE deck_id = $1 AND next_review <= NOW()
     ORDER BY next_review ASC
     LIMIT 100`,
    [deckId],
  );
  res.json(rows);
});

// ─── POST /cards/:id/review — submit SM-2 result ─────────────────────────────
router.post('/cards/:id/review', async (req: AuthRequest, res: Response) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const userId = req.user!.id;
  const { id } = req.params;

  // Fetch current card state
  const current = await pool.query(
    `SELECT f.* FROM flashcards f
     JOIN flashcard_decks d ON f.deck_id = d.id
     WHERE f.id = $1 AND d.user_id = $2`,
    [id, userId],
  );
  if (!current.rows.length) { res.status(404).json({ error: 'Card not found' }); return; }

  const card = current.rows[0];
  const result = sm2(
    parsed.data.quality,
    card.repetitions,
    parseFloat(card.ease_factor),
    card.interval_days,
  );

  const { rows } = await pool.query(
    `UPDATE flashcards
     SET ease_factor   = $1,
         interval_days = $2,
         repetitions   = $3,
         next_review   = $4,
         last_reviewed = NOW()
     WHERE id = $5
     RETURNING *`,
    [result.easeFactor, result.interval, result.repetitions, result.nextReview, id],
  );

  // Update deck updated_at
  await pool.query(
    `UPDATE flashcard_decks SET updated_at = NOW() WHERE id = $1`,
    [card.deck_id],
  );

  res.json(rows[0]);
});

// ─── GET /summary — total due cards across all decks ─────────────────────────
router.get('/summary', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total_due
     FROM flashcards f
     JOIN flashcard_decks d ON f.deck_id = d.id
     WHERE d.user_id = $1 AND f.next_review <= NOW()`,
    [userId],
  );
  res.json({ totalDue: rows[0].total_due });
});

export default router;
