import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../app';
import pool from '../db/pool';

// ─── Mock pool ────────────────────────────────────────────────────────────────
jest.mock('../db/pool', () => ({
  __esModule: true,
  default: {
    query:   jest.fn(),
    connect: jest.fn(),
    end:     jest.fn(),
    totalCount: 0, idleCount: 0, waitingCount: 0,
  },
}));

// Mock bcrypt to avoid slow hashing in tests
jest.mock('bcryptjs', () => ({
  hash:    jest.fn(),
  compare: jest.fn(),
}));

const mockQuery   = pool.query   as unknown as jest.Mock;
const mockConnect = pool.connect as unknown as jest.Mock;
const mockHash    = bcrypt.hash    as jest.Mock;
const mockCompare = bcrypt.compare as jest.Mock;

const mockClient = { query: jest.fn(), release: jest.fn() };

const makeToken = (role = 'student') =>
  jwt.sign({ sub: 'user-id', email: 'test@example.com', role }, process.env.JWT_SECRET!);

const TEST_USER = {
  id: 'user-id', email: 'test@example.com', role: 'student',
  full_name: 'Test User', university: 'TestU', faculty: 'Sci', year: 1,
  language: 'ar', is_verified: false, is_banned: false,
  total_uploads: 0, total_downloads: 0, created_at: new Date().toISOString(),
  password_hash: '$2a$12$mockhash',
};

beforeEach(() => {
  mockConnect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockHash.mockResolvedValue('$2a$12$mockhash');
  mockCompare.mockResolvedValue(true);
});

// ─── POST /register ───────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  const valid = {
    email: 'new@example.com', password: 'securepass', fullName: 'New User',
    university: 'TestU', faculty: 'Sci', year: 1,
  };

  it('400 — invalid email', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ ...valid, email: 'not-email' });
    expect(res.status).toBe(400);
  });

  it('400 — password too short', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ ...valid, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('409 — duplicate email', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    const res = await request(app).post('/api/v1/auth/register').send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already registered');
  });

  it('201 — created with tokens', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })                  // email check
      .mockResolvedValueOnce({ rows: [TEST_USER] })          // INSERT user
      .mockResolvedValueOnce({ rows: [] });                  // INSERT refresh_token
    const res = await request(app).post('/api/v1/auth/register').send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('access');
    expect(res.body).toHaveProperty('refresh');
    expect(res.body.user.email).toBe(TEST_USER.email);
  });
});

// ─── POST /login ──────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  const valid = { email: TEST_USER.email, password: 'securepass' };

  it('400 — invalid payload', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'bad' });
    expect(res.status).toBe(400);
  });

  it('401 — user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/v1/auth/login').send(valid);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('403 — banned account', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...TEST_USER, is_banned: true }] });
    const res = await request(app).post('/api/v1/auth/login').send(valid);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Account suspended');
  });

  it('401 — wrong password', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [TEST_USER] });
    mockCompare.mockResolvedValueOnce(false);
    const res = await request(app).post('/api/v1/auth/login').send(valid);
    expect(res.status).toBe(401);
  });

  it('200 — success, no password_hash in response', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [TEST_USER] })  // SELECT user
      .mockResolvedValueOnce({ rows: [] });           // INSERT refresh_token
    const res = await request(app).post('/api/v1/auth/login').send(valid);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });
});

// ─── POST /refresh ────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/refresh', () => {
  it('400 — missing refreshToken', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('401 — garbage token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'garbage' });
    expect(res.status).toBe(401);
  });

  it('401 — valid jwt but revoked in DB', async () => {
    const refresh = jwt.sign({ sub: 'user-id' }, process.env.JWT_REFRESH_SECRET!);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // not in DB
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: refresh });
    expect(res.status).toBe(401);
  });

  it('200 — rotates tokens', async () => {
    const refresh = jwt.sign({ sub: TEST_USER.id }, process.env.JWT_REFRESH_SECRET!);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'stored-id' }] })                            // SELECT stored token
      .mockResolvedValueOnce({ rows: [{ id: TEST_USER.id, email: TEST_USER.email, role: TEST_USER.role }] }) // SELECT user
      .mockResolvedValueOnce({ rows: [] })                                                // DELETE old token
      .mockResolvedValueOnce({ rows: [] });                                               // INSERT new token
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: refresh });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access');
    expect(res.body).toHaveProperty('refresh');
  });
});

// ─── POST /logout ─────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/logout', () => {
  it('401 — no token', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });

  it('204 — success', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(204);
  });
});

// ─── GET /me ──────────────────────────────────────────────────────────────────
describe('GET /api/v1/auth/me', () => {
  it('401 — no token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('200 — returns profile', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [TEST_USER] });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_USER.email);
  });
});

// ─── PUT /me ──────────────────────────────────────────────────────────────────
describe('PUT /api/v1/auth/me', () => {
  it('401 — no token', async () => {
    const res = await request(app).put('/api/v1/auth/me').send({ fullName: 'X' });
    expect(res.status).toBe(401);
  });

  it('400 — nothing to update', async () => {
    const res = await request(app)
      .put('/api/v1/auth/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('200 — profile updated', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...TEST_USER, full_name: 'Updated' }] });
    const res = await request(app)
      .put('/api/v1/auth/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ fullName: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe('Updated');
  });
});
