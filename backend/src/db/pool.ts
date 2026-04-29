import { Pool } from 'pg';
import dotenv from 'dotenv';

for (const k of ['GROQ_API_KEY', 'WHISPER_GROQ_API_KEY', 'SUMMARY_AI_GROQ_API_KEY'] as const) {
  if (process.env[k] === '') delete process.env[k];
}
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,                        // augmenté de 20 → 50 pour supporter + de charge
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000, // augmenté de 2s → 5s pour éviter les faux timeouts
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
});

export default pool;
