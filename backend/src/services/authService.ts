import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash } from 'crypto';
import pool from '../db/pool';
import { awardBonusDay } from './subscriptionService';

export type UserRecord = Record<string, unknown>;
export type AuthResult = { user: UserRecord; access: string; refresh: string };
export type RegisterResult = AuthResult | { user: UserRecord; pending: true };

// ─── Token helpers ────────────────────────────────────────────────────────────

export const hashToken = (t: string): string =>
  createHash('sha256').update(t).digest('hex');

export const makeTokens = (user: { id: string; email: string; role: string }) => {
  const aOpts: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN         || '15m') as SignOptions['expiresIn'] };
  const rOpts: SignOptions = { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as SignOptions['expiresIn'] };
  const access  = jwt.sign({ sub: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET!,         aOpts);
  const refresh = jwt.sign({ sub: user.id },                                     process.env.JWT_REFRESH_SECRET!, rOpts);
  return { access, refresh };
};

export const persistRefreshToken = async (userId: string, token: string): Promise<void> => {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [userId, hashToken(token)],
  );
};

// ─── Register ─────────────────────────────────────────────────────────────────

export interface RegisterInput {
  email: string; password: string; fullName: string;
  university: string; faculty: string; filiere?: string; year: number;
  referralCode?: string; // optional 8-char code (first 8 chars of referrer UUID without dashes)
}

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [input.email]);
  if (existing.rows.length) throw Object.assign(new Error('Email already registered'), { status: 409 });

  // ── Resolve referral code ──────────────────────────────────────────────────
  // Code = first 8 chars of the referrer UUID (without dashes), uppercase
  let referrerId: string | null = null;
  if (input.referralCode && input.referralCode.length === 8) {
    const code = input.referralCode.trim().toLowerCase();
    const { rows: refRows } = await pool.query(
      `SELECT id FROM users WHERE REPLACE(id::text, '-', '') LIKE $1 LIMIT 1`,
      [code + '%'],
    );
    if (refRows.length) referrerId = refRows[0].id as string;
  }

  const password_hash = await bcrypt.hash(input.password, 10);
  const autoApprove = (process.env.NODE_ENV || 'development') === 'test';
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, university, faculty, filiere, year, referred_by, is_approved)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, email, full_name, role, language, university, faculty, filiere, year,
               is_verified, is_approved, total_uploads, total_downloads, created_at`,
    [input.email, password_hash, input.fullName, input.university, input.faculty, input.filiere ?? null, input.year, referrerId, autoApprove],
  );
  const user = rows[0];

  // ── Award referral bonus — fire-and-forget ─────────────────────────────────
  if (referrerId) {
    setImmediate(async () => {
      try {
        // Prevent double-credit (unique constraint on referred_id)
        await pool.query(
          `INSERT INTO referral_rewards (referrer_id, referred_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [referrerId, user.id],
        );
        // +7 bonus days for the referrer
        for (let i = 0; i < 7; i++) await awardBonusDay(referrerId!);
        // +2 bonus days for the new user as welcome bonus
        for (let i = 0; i < 2; i++) await awardBonusDay(user.id as string);
        console.log(`[referral] ${referrerId} referred ${user.id} → +7d referrer, +2d new user`);
      } catch (e) {
        console.error('[referral] bonus award failed:', e);
      }
    });
  }

  if (autoApprove) {
    const tokens = makeTokens({ id: user.id as string, email: user.email as string, role: user.role as string });
    await persistRefreshToken(user.id as string, tokens.refresh);
    return { user, ...tokens };
  }

  return { user, pending: true };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, role, full_name, language, university, faculty, filiere, year,
            is_verified, is_banned, is_approved, total_uploads, total_downloads, created_at
     FROM users WHERE email = $1`,
    [email],
  );
  if (!rows.length) throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  const user = rows[0];
  if (user.is_banned === true) throw Object.assign(new Error('Account suspended'), { status: 403 });
  if (user.is_approved === false) throw Object.assign(new Error('Account pending approval'), { status: 403 });
  const valid = await bcrypt.compare(password, user.password_hash as string);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  const { password_hash: _ph, ...safeUser } = user;
  const tokens = makeTokens({ id: user.id as string, email: user.email as string, role: user.role as string });
  await persistRefreshToken(user.id as string, tokens.refresh);
  return { user: safeUser, ...tokens };
}

// ─── Refresh token rotation ────────────────────────────────────────────────────

export async function rotateRefreshToken(refreshToken: string): Promise<{ access: string; refresh: string }> {
  let payload: { sub: string };
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { sub: string };
  } catch {
    throw Object.assign(new Error('Refresh token invalid'), { status: 401 });
  }
  const hash = hashToken(refreshToken);
  const { rows: stored } = await pool.query(
    `SELECT id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
    [payload.sub, hash],
  );
  if (!stored.length) throw Object.assign(new Error('Refresh token invalid or revoked'), { status: 401 });
  const { rows: users } = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [payload.sub]);
  if (!users.length) throw Object.assign(new Error('User not found'), { status: 401 });
  await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [stored[0].id]);
  const tokens = makeTokens(users[0] as { id: string; email: string; role: string });
  await persistRefreshToken(users[0].id as string, tokens.refresh);
  return tokens;
}

// ─── Revoke tokens ────────────────────────────────────────────────────────────

export async function revokeTokens(userId: string, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2',
      [userId, hashToken(refreshToken)],
    );
  } else {
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<UserRecord> {
  const { rows } = await pool.query(
    `SELECT id, email, full_name, role, language, university, faculty, filiere, year,
            avatar_url, is_verified, total_uploads, total_downloads, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows.length) throw Object.assign(new Error('User not found'), { status: 404 });
  return rows[0];
}

export async function updateProfile(
  userId: string,
  data: { fullName?: string; university?: string; faculty?: string; filiere?: string; year?: number },
): Promise<UserRecord> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.fullName)     { params.push(data.fullName);    sets.push(`full_name = $${params.length}`); }
  if (data.university)   { params.push(data.university);  sets.push(`university = $${params.length}`); }
  if (data.faculty)      { params.push(data.faculty);     sets.push(`faculty = $${params.length}`); }
  if (data.filiere !== undefined) { params.push(data.filiere ?? null); sets.push(`filiere = $${params.length}`); }
  if (data.year != null) { params.push(data.year);        sets.push(`year = $${params.length}`); }
  if (!sets.length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  params.push(userId);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
     RETURNING id, email, full_name, role, language, university, faculty, filiere, year,
               avatar_url, is_verified, total_uploads, total_downloads, created_at`,
    params,
  );
  return rows[0];
}
