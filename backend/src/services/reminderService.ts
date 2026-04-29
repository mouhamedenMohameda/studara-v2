import pool from '../db/pool';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReminderInput = {
  title: string; description?: string;
  reminderType: 'exam' | 'assignment' | 'course' | 'other';
  scheduledAt: string; courseColor?: string;
  scope: 'personal' | 'global';
};

export type ReminderPatch = {
  title?: string; description?: string; reminderType?: string;
  scheduledAt?: string; isCompleted?: boolean;
};

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listReminders(userId: string, scope?: string, completed?: string) {
  if (scope === 'global') {
    const { rows } = await pool.query(
      `SELECT r.*, u.full_name AS submitter_name
       FROM reminders r LEFT JOIN users u ON r.submitted_by = u.id
       WHERE r.scope = 'global'
         AND (r.status = 'approved' OR (r.submitted_by = $1 AND r.status IN ('pending','rejected')))
       ORDER BY r.scheduled_at ASC`,
      [userId],
    );
    return rows;
  }
  const conditions = ["r.user_id = $1", "r.scope = 'personal'"];
  if (completed !== undefined) conditions.push(`r.is_completed = ${completed === 'true'}`);
  const { rows } = await pool.query(
    `SELECT r.* FROM reminders r WHERE ${conditions.join(' AND ')} ORDER BY r.scheduled_at ASC`,
    [userId],
  );
  return rows;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createReminder(userId: string, data: ReminderInput) {
  const status      = data.scope === 'global' ? 'pending' : 'active';
  const submittedBy = data.scope === 'global' ? userId : null;
  const { rows } = await pool.query(
    `INSERT INTO reminders
       (user_id, title, description, reminder_type, scheduled_at, course_color, scope, status, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [userId, data.title, data.description, data.reminderType,
     data.scheduledAt, data.courseColor, data.scope, status, submittedBy],
  );
  return rows[0];
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateReminder(id: string, userId: string, data: ReminderPatch) {
  const { rows } = await pool.query(
    `UPDATE reminders
     SET title         = COALESCE($3, title),
         description   = COALESCE($4, description),
         reminder_type = COALESCE($5, reminder_type),
         scheduled_at  = COALESCE($6, scheduled_at),
         is_completed  = COALESCE($7, is_completed)
     WHERE id = $1 AND (user_id = $2 OR submitted_by = $2) RETURNING *`,
    [id, userId, data.title, data.description, data.reminderType, data.scheduledAt, data.isCompleted],
  );
  if (!rows.length) throw Object.assign(new Error('Reminder not found'), { status: 404 });
  return rows[0];
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteReminder(id: string, userId: string): Promise<void> {
  const { rowCount } = await pool.query(
    `DELETE FROM reminders WHERE id = $1 AND (user_id = $2 OR submitted_by = $2)`,
    [id, userId],
  );
  if (!rowCount) throw Object.assign(new Error('Reminder not found'), { status: 404 });
}

// ─── Admin: list pending global reminders ────────────────────────────────────

export async function listPendingGlobal() {
  const { rows } = await pool.query(
    `SELECT r.*, u.full_name AS submitter_name, u.email AS submitter_email
     FROM reminders r LEFT JOIN users u ON r.submitted_by = u.id
     WHERE r.scope = 'global' AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
  );
  return rows;
}

// ─── Admin: approve / reject ──────────────────────────────────────────────────

export async function setReminderStatus(id: string, status: 'approved' | 'rejected') {
  const { rows } = await pool.query(
    `UPDATE reminders SET status = $2 WHERE id = $1 AND scope = 'global' RETURNING *`,
    [id, status],
  );
  if (!rows.length) throw Object.assign(new Error('Reminder not found'), { status: 404 });
  return rows[0];
}
