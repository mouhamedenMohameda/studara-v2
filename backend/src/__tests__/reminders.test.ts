import request from 'supertest';
import jwt from 'jsonwebtoken';
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

const mockQuery   = pool.query   as unknown as jest.Mock;
const mockConnect = pool.connect as unknown as jest.Mock;
const mockClient  = { query: jest.fn(), release: jest.fn() };

const makeToken = (role = 'student') =>
  jwt.sign({ sub: 'user-id', email: 'test@example.com', role }, process.env.JWT_SECRET!);

const FAKE_REMINDER = {
  id: 'rem-id', user_id: 'user-id', title: 'Exam Prep',
  description: 'Study chapter 5', reminder_type: 'exam',
  scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
  scope: 'personal', status: 'active', is_completed: false,
  created_at: new Date().toISOString(),
};

beforeEach(() => {
  mockConnect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── GET /reminders ───────────────────────────────────────────────────────────
describe('GET /api/v1/reminders', () => {
  it('401 — unauthenticated', async () => {
    const res = await request(app).get('/api/v1/reminders');
    expect(res.status).toBe(401);
  });

  it('200 — personal reminders', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [FAKE_REMINDER] });
    const res = await request(app)
      .get('/api/v1/reminders?scope=personal')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — global reminders', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...FAKE_REMINDER, scope: 'global', status: 'approved' }] });
    const res = await request(app)
      .get('/api/v1/reminders?scope=global')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── POST /reminders ──────────────────────────────────────────────────────────
describe('POST /api/v1/reminders', () => {
  const valid = {
    title: 'Exam Prep',
    reminderType: 'exam',
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    scope: 'personal',
  };

  it('401 — unauthenticated', async () => {
    const res = await request(app).post('/api/v1/reminders').send(valid);
    expect(res.status).toBe(401);
  });

  it('400 — missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/reminders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'No date' });
    expect(res.status).toBe(400);
  });

  it('201 — personal reminder created', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [FAKE_REMINDER] });
    const res = await request(app)
      .post('/api/v1/reminders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(valid);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(FAKE_REMINDER.id);
  });

  it('201 — global reminder created with pending status', async () => {
    const globalReminder = { ...FAKE_REMINDER, scope: 'global', status: 'pending' };
    mockQuery.mockResolvedValueOnce({ rows: [globalReminder] });
    const res = await request(app)
      .post('/api/v1/reminders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...valid, scope: 'global' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });
});

// ─── PUT /reminders/:id ───────────────────────────────────────────────────────
describe('PUT /api/v1/reminders/:id', () => {
  it('401 — unauthenticated', async () => {
    const res = await request(app).put(`/api/v1/reminders/${FAKE_REMINDER.id}`).send({ isCompleted: true });
    expect(res.status).toBe(401);
  });

  it('400 — invalid patch data', async () => {
    const res = await request(app)
      .put(`/api/v1/reminders/${FAKE_REMINDER.id}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ reminderType: 'invalid-type' });
    expect(res.status).toBe(400);
  });

  it('404 — not found or not owned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/v1/reminders/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ isCompleted: true });
    expect(res.status).toBe(404);
  });

  it('200 — updated', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...FAKE_REMINDER, is_completed: true }] });
    const res = await request(app)
      .put(`/api/v1/reminders/${FAKE_REMINDER.id}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ isCompleted: true });
    expect(res.status).toBe(200);
    expect(res.body.is_completed).toBe(true);
  });
});

// ─── DELETE /reminders/:id ────────────────────────────────────────────────────
describe('DELETE /api/v1/reminders/:id', () => {
  it('401 — unauthenticated', async () => {
    const res = await request(app).delete(`/api/v1/reminders/${FAKE_REMINDER.id}`);
    expect(res.status).toBe(401);
  });

  it('404 — not found', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app)
      .delete('/api/v1/reminders/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('204 — deleted', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete(`/api/v1/reminders/${FAKE_REMINDER.id}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(204);
  });
});
