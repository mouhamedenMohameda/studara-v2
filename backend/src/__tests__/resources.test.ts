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

const mockClient = { query: jest.fn(), release: jest.fn() };

const makeToken = (role = 'student') =>
  jwt.sign({ sub: 'user-id', email: 'test@example.com', role }, process.env.JWT_SECRET!);

const FAKE_RESOURCE = {
  id: 'res-id', title: 'Test Resource', title_ar: null,
  subject: 'Math', resource_type: 'note', faculty: 'Sci', university: 'TestU',
  year: 1, file_url: null, file_name: null, file_size: null, file_type: null,
  downloads: 0, likes: 0, tags: [], created_at: new Date().toISOString(),
  uploaded_by: 'user-id', uploader_name: 'Test User',
};

beforeEach(() => {
  mockConnect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── GET /resources ───────────────────────────────────────────────────────────
describe('GET /api/v1/resources', () => {
  it('200 — returns paginated list', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FAKE_RESOURCE] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const res = await request(app).get('/api/v1/resources');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('200 — accepts filter params', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const res = await request(app).get('/api/v1/resources?faculty=Sci&year=2&q=math');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

// ─── GET /resources/:id ───────────────────────────────────────────────────────
describe('GET /api/v1/resources/:id', () => {
  it('404 — not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/resources/bad-id');
    expect(res.status).toBe(404);
  });

  it('200 — returns resource', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [FAKE_RESOURCE] });
    const res = await request(app).get(`/api/v1/resources/${FAKE_RESOURCE.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(FAKE_RESOURCE.id);
  });
});

// ─── POST /resources/:id/download ────────────────────────────────────────────
describe('POST /api/v1/resources/:id/download', () => {
  it('401 — unauthenticated', async () => {
    const res = await request(app).post(`/api/v1/resources/${FAKE_RESOURCE.id}/download`);
    expect(res.status).toBe(401);
  });

  it('404 — resource not found', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app)
      .post('/api/v1/resources/bad-id/download')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('204 — counter incremented', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .post(`/api/v1/resources/${FAKE_RESOURCE.id}/download`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(204);
  });
});

// ─── POST /resources (create) ─────────────────────────────────────────────────
describe('POST /api/v1/resources', () => {
  const valid = {
    title: 'Test Resource', resourceType: 'note',
    faculty: 'Sci', university: 'TestU', subject: 'Math', year: 1,
  };

  it('401 — unauthenticated', async () => {
    const res = await request(app).post('/api/v1/resources').send(valid);
    expect(res.status).toBe(401);
  });

  it('400 — missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/resources')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  it('201 — created without file', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FAKE_RESOURCE] })  // INSERT resource
      .mockResolvedValueOnce({ rows: [] });               // UPDATE total_uploads
    const res = await request(app)
      .post('/api/v1/resources')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(valid);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(FAKE_RESOURCE.id);
  });
});

// ─── DELETE /resources/:id ────────────────────────────────────────────────────
describe('DELETE /api/v1/resources/:id', () => {
  it('401 — unauthenticated', async () => {
    const res = await request(app).delete(`/api/v1/resources/${FAKE_RESOURCE.id}`);
    expect(res.status).toBe(401);
  });

  it('404 — not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/api/v1/resources/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('403 — not the owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ uploaded_by: 'other-user', file_url: null }] });
    const res = await request(app)
      .delete(`/api/v1/resources/${FAKE_RESOURCE.id}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(403);
  });

  it('200 — deleted by owner', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ uploaded_by: 'user-id', file_url: null }] })
      .mockResolvedValueOnce({ rows: [] })   // DELETE resource
      .mockResolvedValueOnce({ rows: [] });  // UPDATE total_uploads
    const res = await request(app)
      .delete(`/api/v1/resources/${FAKE_RESOURCE.id}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('200 — admin can delete any resource', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ uploaded_by: 'other-user', file_url: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete(`/api/v1/resources/${FAKE_RESOURCE.id}`)
      .set('Authorization', `Bearer ${makeToken('admin')}`);
    expect(res.status).toBe(200);
  });
});

// ─── POST /resources/:id/like ─────────────────────────────────────────────────
describe('POST /api/v1/resources/:id/like', () => {
  it('401 — unauthenticated', async () => {
    const res = await request(app).post(`/api/v1/resources/${FAKE_RESOURCE.id}/like`);
    expect(res.status).toBe(401);
  });

  it('200 — liked (not previously liked)', async () => {
    // mockClient.query is reset before each test; default returns { rows: [], rowCount: 0 }
    // SELECT FOR UPDATE returns [] → not liked → INSERT → UPDATE → COMMIT
    const res = await request(app)
      .post(`/api/v1/resources/${FAKE_RESOURCE.id}/like`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.liked).toBe(true);
  });

  it('200 — unliked (previously liked)', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })        // BEGIN
      .mockResolvedValueOnce({ rows: [{}] })      // SELECT FOR UPDATE → found → unlike
      .mockResolvedValueOnce({ rows: [] })        // DELETE like
      .mockResolvedValueOnce({ rows: [] })        // UPDATE likes count
      .mockResolvedValueOnce({ rows: [] });       // COMMIT
    const res = await request(app)
      .post(`/api/v1/resources/${FAKE_RESOURCE.id}/like`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.liked).toBe(false);
  });
});
