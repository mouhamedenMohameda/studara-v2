// Set environment variables before any module is loaded
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-also-at-least-32-characters!!';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test_db';
