import path from 'path';
import pool from '../db/pool';
import { cacheGet, cacheSet, cacheDeletePattern } from './cache';

// ─── Cache helpers ────────────────────────────────────────────────────────────
const CACHE_PREFIX = 'res:list:';

/** Vider le cache resources (appelé après approve/reject/delete d'une resource) */
export function invalidateResourcesCache(): void {
  // Fire-and-forget : pas besoin d'attendre la réponse Redis
  cacheDeletePattern(`${CACHE_PREFIX}*`).catch(() => {});
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResourceFilters = {
  q?: string; faculty?: string; university?: string; type?: string;
  year?: string; semester?: string; subject?: string; page?: string; limit?: string;
};

export type CreateResourceInput = {
  title: string; titleAr?: string; description?: string;
  resourceType: 'note' | 'past_exam' | 'summary' | 'exercise' | 'project' | 'presentation' | 'video_course';
  faculty: string; university: string; subject: string; year: number; semester?: number; tags?: string;
  videoUrl?: string;
};

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listResources(filters: ResourceFilters) {
  const { q, faculty, university, type, year, semester, subject, page = '1', limit = '20' } = filters;
  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, parseInt(limit));
  const offset   = (pageNum - 1) * limitNum;

  // Cache key basée sur tous les filtres (sauf pour les recherches textuelles)
  const cacheKey = q ? null : `${CACHE_PREFIX}${JSON.stringify({ faculty, university, type, year, semester, subject, pageNum, limitNum })}`;
  if (cacheKey) {
    const cached = await cacheGet<{ data: unknown[]; total: number; page: number; limit: number }>(cacheKey);
    if (cached) return cached;
  }

  const conditions: string[] = ["r.status = 'approved'"];
  const params: unknown[] = [];
  let qParamIdx: number | null = null;

  const expandFacultyAliases = (f: string): string[] => {
    // Accept both legacy buckets and academic-structure slugs stored in old rows.
    const aliases: Record<string, string[]> = {
      sciences:    ['sciences', 'una-fst'],
      medicine:    ['medicine', 'una-fm'],
      arts:        ['arts', 'una-flsh'],
      islamic:     ['islamic', 'una-fsi', 'iseri-quran', 'iseri-fiqh'],
      engineering: ['engineering', 'poly-ipgei', 'poly-numerique', 'poly-aleg', 'poly-zouerat', 'poly-energie', 'poly-statistique', 'iset-genie', 'iset-agro'],
      law:         ['law', 'una-fsje'],
      economics:   ['economics', 'una-fsje'],
    };
    return aliases[f] ?? [f];
  };

  if (q && q.trim()) {
    const term = q.trim();
    params.push(term);
    qParamIdx = params.length;
    params.push(`%${term}%`);
    conditions.push(
      `(r.search_vector @@ plainto_tsquery('simple', $${qParamIdx}) OR r.title ILIKE $${params.length} OR r.title_ar ILIKE $${params.length} OR r.subject ILIKE $${params.length})`,
    );
  }
  if (faculty)    { params.push(expandFacultyAliases(faculty)); conditions.push(`r.faculty = ANY($${params.length})`); }
  if (university) { params.push(university);     conditions.push(`r.university = $${params.length}`); }
  if (type)       { params.push(type);           conditions.push(`r.resource_type = $${params.length}`); }
  else            { conditions.push(`r.resource_type != 'video_course'`); }
  if (year)       { params.push(parseInt(year)); conditions.push(`r.year = $${params.length}`); }
  if (semester)   { params.push(parseInt(semester)); conditions.push(`r.semester = $${params.length}`); }
  if (subject)    { params.push(subject);        conditions.push(`r.subject = $${params.length}`); }

  const where   = `WHERE ${conditions.join(' AND ')}`;
  const orderBy = qParamIdx
    ? `ORDER BY ts_rank(r.search_vector, plainto_tsquery('simple', $${qParamIdx})) DESC, r.downloads DESC`
    : `ORDER BY r.downloads DESC`;

  params.push(limitNum, offset);

  const { rows } = await pool.query(
    `SELECT r.id, r.title, r.title_ar, r.subject, r.resource_type, r.faculty, r.university,
            r.year, r.semester, r.file_url, r.file_name, r.file_size, r.file_type,
            r.downloads, r.likes, r.tags, r.created_at,
            u.id AS uploader_id, u.full_name AS uploader_name
     FROM resources r JOIN users u ON r.uploaded_by = u.id
     ${where} ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM resources r ${where}`,
    params.slice(0, params.length - 2),
  );

  const result = { data: rows, total: parseInt(countResult.rows[0].count), page: pageNum, limit: limitNum };
  if (cacheKey) cacheSet(cacheKey, result).catch(() => {}); // fire-and-forget
  return result;
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getResource(id: string) {
  const { rows } = await pool.query(
    `SELECT r.*, u.id AS uploader_id, u.full_name AS uploader_name, u.faculty AS uploader_faculty
     FROM resources r JOIN users u ON r.uploaded_by = u.id
     WHERE r.id = $1 AND r.status = 'approved'`,
    [id],
  );
  if (!rows.length) throw Object.assign(new Error('Resource not found'), { status: 404 });
  return rows[0];
}

// ─── Increment download counter ───────────────────────────────────────────────

export async function incrementDownload(id: string): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE resources SET downloads = downloads + 1 WHERE id = $1 AND status = 'approved'`,
    [id],
  );
  if (!rowCount) throw Object.assign(new Error('Resource not found'), { status: 404 });
}

// ─── My submissions (all statuses, for the uploader) ─────────────────────────

export async function listMySubmissions(userId: string) {
  const { rows } = await pool.query(
    `SELECT id, title, title_ar, subject, resource_type, faculty, university, year, semester,
            file_url, file_name, file_size, file_type,
            status, rejection_reason, moderated_at,
            downloads, likes, tags, created_at
     FROM resources
     WHERE uploaded_by = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function createResource(
  userId: string,
  data: CreateResourceInput,
  file?: Express.Multer.File,
) {
  const fileUrl  = file ? `/uploads/${file.filename}` : (data.videoUrl ?? null);
  const fileName = file ? file.originalname : null;
  const fileSize = file ? file.size : null;
  const fileType = file ? path.extname(file.originalname).slice(1) : (data.videoUrl ? 'url' : null);
  const tags     = data.tags ? JSON.parse(data.tags) : [];

  const { rows } = await pool.query(
    `INSERT INTO resources
       (title, title_ar, description, resource_type, faculty, university, subject, year, semester,
        file_url, file_name, file_size, file_type, uploaded_by, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [data.title, data.titleAr, data.description, data.resourceType, data.faculty,
     data.university, data.subject, data.year, data.semester ?? null,
     fileUrl, fileName, fileSize, fileType, userId, tags],
  );
  await pool.query(`UPDATE users SET total_uploads = total_uploads + 1 WHERE id = $1`, [userId]);
  return rows[0];
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteResource(id: string, userId: string, isAdmin: boolean): Promise<void> {
  const { rows } = await pool.query('SELECT uploaded_by, file_url FROM resources WHERE id = $1', [id]);
  if (!rows.length) throw Object.assign(new Error('Resource not found'), { status: 404 });
  if (rows[0].uploaded_by !== userId && !isAdmin) throw Object.assign(new Error('Not allowed'), { status: 403 });

  if ((rows[0].file_url as string)?.startsWith('/uploads/')) {
    const fs = await import('fs');
    fs.default.unlink(`${process.cwd()}${rows[0].file_url}`, () => {});
  }
  await pool.query('DELETE FROM resources WHERE id = $1', [id]);
  await pool.query('UPDATE users SET total_uploads = GREATEST(total_uploads - 1, 0) WHERE id = $1', [userId]);
  invalidateResourcesCache();
}

// ─── Toggle like (transaction) ────────────────────────────────────────────────

export async function toggleLike(userId: string, resourceId: string): Promise<{ liked: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT 1 FROM resource_likes WHERE user_id=$1 AND resource_id=$2 FOR UPDATE',
      [userId, resourceId],
    );
    let liked: boolean;
    if (existing.rows.length) {
      await client.query('DELETE FROM resource_likes WHERE user_id=$1 AND resource_id=$2', [userId, resourceId]);
      await client.query('UPDATE resources SET likes = GREATEST(likes - 1, 0) WHERE id=$1', [resourceId]);
      liked = false;
    } else {
      await client.query('INSERT INTO resource_likes (user_id, resource_id) VALUES ($1, $2)', [userId, resourceId]);
      await client.query('UPDATE resources SET likes = likes + 1 WHERE id=$1', [resourceId]);
      liked = true;
    }
    await client.query('COMMIT');
    return { liked };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Toggle bookmark (transaction) ───────────────────────────────────────────

export async function toggleBookmark(userId: string, resourceId: string): Promise<{ bookmarked: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT 1 FROM resource_bookmarks WHERE user_id=$1 AND resource_id=$2 FOR UPDATE',
      [userId, resourceId],
    );
    let bookmarked: boolean;
    if (existing.rows.length) {
      await client.query('DELETE FROM resource_bookmarks WHERE user_id=$1 AND resource_id=$2', [userId, resourceId]);
      bookmarked = false;
    } else {
      await client.query('INSERT INTO resource_bookmarks (user_id, resource_id) VALUES ($1, $2)', [userId, resourceId]);
      bookmarked = true;
    }
    await client.query('COMMIT');
    return { bookmarked };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
