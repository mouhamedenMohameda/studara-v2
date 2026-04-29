import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── Public: GET /api/v1/academic-structure ───────────────────────────────────
// Returns the full hierarchy tree: universities → faculties → filieres
// Used by the mobile app (no auth required)
router.get('/', async (_req, res: Response) => {
  try {
    const univs = await pool.query(
      `SELECT id, slug, name_ar, name_fr, city FROM academic_universities
       WHERE is_active = true ORDER BY sort_order, id`
    );
    const facs = await pool.query(
      `SELECT id, slug, university_slug, name_ar, name_fr, type, diploma_note, num_years FROM academic_faculties
       WHERE is_active = true ORDER BY sort_order, id`
    );
    const fils = await pool.query(
      `SELECT id, slug, faculty_slug, name_ar, name_fr FROM academic_filieres
       WHERE is_active = true ORDER BY sort_order, id`
    );

    // Build nested tree
    const filsByFac: Record<string, any[]> = {};
    for (const f of fils.rows) {
      (filsByFac[f.faculty_slug] ??= []).push({
        slug: f.slug, nameAr: f.name_ar, nameFr: f.name_fr,
      });
    }

    const facsByUniv: Record<string, any[]> = {};
    for (const f of facs.rows) {
      (facsByUniv[f.university_slug] ??= []).push({
        slug: f.slug, nameAr: f.name_ar, nameFr: f.name_fr,
        type: f.type, diplomaNote: f.diploma_note || undefined,
        numYears: f.num_years ?? undefined,
        filieres: filsByFac[f.slug] ?? [],
      });
    }

    const tree = univs.rows.map(u => ({
      slug: u.slug, nameAr: u.name_ar, nameFr: u.name_fr, city: u.city,
      faculties: facsByUniv[u.slug] ?? [],
    }));

    res.json({ data: tree });
  } catch (err) {
    console.error('[academic-structure] GET /', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Admin CRUD (require auth + admin/moderator role) ─────────────────────────
router.use(authenticate);
router.use(requireRole('admin', 'moderator'));

// ── Universities ──────────────────────────────────────────────────────────────
router.get('/universities', async (_req, res: Response) => {
  const { rows } = await pool.query(
    'SELECT * FROM academic_universities ORDER BY sort_order, id'
  );
  res.json({ data: rows });
});

router.post('/universities', async (req: AuthRequest, res: Response) => {
  const { slug, name_ar, name_fr, city, sort_order = 0 } = req.body;
  if (!slug || !name_ar || !name_fr) {
    res.status(400).json({ error: 'slug, name_ar, name_fr are required' }); return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO academic_universities (slug, name_ar, name_fr, city, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [slug, name_ar, name_fr, city || null, sort_order]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'slug already exists' }); return; }
    res.status(500).json({ error: err.message });
  }
});

router.put('/universities/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { slug, name_ar, name_fr, city, sort_order, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE academic_universities
       SET slug=$1, name_ar=$2, name_fr=$3, city=$4, sort_order=$5, is_active=$6
       WHERE id=$7 RETURNING *`,
      [slug, name_ar, name_fr, city || null, sort_order ?? 0, is_active ?? true, id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ data: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'slug already exists' }); return; }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/universities/:id', async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM academic_universities WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Faculties ─────────────────────────────────────────────────────────────────
router.get('/faculties', async (req, res: Response) => {
  const { university_slug } = req.query;
  let q = 'SELECT * FROM academic_faculties';
  const params: any[] = [];
  if (university_slug) { q += ' WHERE university_slug=$1'; params.push(university_slug); }
  q += ' ORDER BY sort_order, id';
  const { rows } = await pool.query(q, params);
  res.json({ data: rows });
});

router.post('/faculties', async (req: AuthRequest, res: Response) => {
  const { slug, university_slug, name_ar, name_fr, type = 'faculty', diploma_note, sort_order = 0, num_years } = req.body;
  if (!slug || !university_slug || !name_ar || !name_fr) {
    res.status(400).json({ error: 'slug, university_slug, name_ar, name_fr are required' }); return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO academic_faculties (slug, university_slug, name_ar, name_fr, type, diploma_note, sort_order, num_years)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [slug, university_slug, name_ar, name_fr, type, diploma_note || null, sort_order, num_years ?? null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'slug already exists' }); return; }
    res.status(500).json({ error: err.message });
  }
});

router.put('/faculties/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { slug, university_slug, name_ar, name_fr, type, diploma_note, sort_order, is_active, num_years } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE academic_faculties
       SET slug=$1, university_slug=$2, name_ar=$3, name_fr=$4, type=$5, diploma_note=$6, sort_order=$7, is_active=$8, num_years=$9
       WHERE id=$10 RETURNING *`,
      [slug, university_slug, name_ar, name_fr, type ?? 'faculty', diploma_note || null, sort_order ?? 0, is_active ?? true, num_years ?? null, id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ data: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'slug already exists' }); return; }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/faculties/:id', async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM academic_faculties WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Filieres ──────────────────────────────────────────────────────────────────
router.get('/filieres', async (req, res: Response) => {
  const { faculty_slug } = req.query;
  let q = 'SELECT * FROM academic_filieres';
  const params: any[] = [];
  if (faculty_slug) { q += ' WHERE faculty_slug=$1'; params.push(faculty_slug); }
  q += ' ORDER BY sort_order, id';
  const { rows } = await pool.query(q, params);
  res.json({ data: rows });
});

router.post('/filieres', async (req: AuthRequest, res: Response) => {
  const { slug, faculty_slug, name_ar, name_fr, sort_order = 0 } = req.body;
  if (!slug || !faculty_slug || !name_ar || !name_fr) {
    res.status(400).json({ error: 'slug, faculty_slug, name_ar, name_fr are required' }); return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO academic_filieres (slug, faculty_slug, name_ar, name_fr, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [slug, faculty_slug, name_ar, name_fr, sort_order]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'slug already exists' }); return; }
    res.status(500).json({ error: err.message });
  }
});

router.put('/filieres/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { slug, faculty_slug, name_ar, name_fr, sort_order, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE academic_filieres
       SET slug=$1, faculty_slug=$2, name_ar=$3, name_fr=$4, sort_order=$5, is_active=$6
       WHERE id=$7 RETURNING *`,
      [slug, faculty_slug, name_ar, name_fr, sort_order ?? 0, is_active ?? true, id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ data: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'slug already exists' }); return; }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/filieres/:id', async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM academic_filieres WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

export default router;
