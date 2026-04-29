import './loadEnv';
import { z } from 'zod';
import pool from './db/pool';
import { closeCacheClient } from './services/cache';
import { registerScrapeJobsCron } from './jobs/scrapeJobsCron';
import { startExpireReferralBonusesCron } from './jobs/expireReferralBonusesCron';
import app from './app';

// ─── Validate required env vars at startup (fail fast) ────────────────────────
const _envResult = z.object({
  DATABASE_URL:       z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET:         z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
}).safeParse(process.env);

if (!_envResult.success) {
  console.error('[FATAL] Missing or invalid environment variables:');
  for (const [field, msgs] of Object.entries(_envResult.error.flatten().fieldErrors)) {
    console.error(`  ${field}: ${(msgs as string[]).join(', ')}`);
  }
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

// ─── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`🚀 Studara API  •  port ${PORT}  •  [${process.env.NODE_ENV || 'development'}]`);
});

// ─── Background jobs ─────────────────────────────────────────────────────────
const cronTask = process.env.SCRAPER_ENABLED === 'true'
  ? registerScrapeJobsCron()
  : null;

// Always active: expire referral bonuses at 02:00 UTC daily
const expireBonusesCron = startExpireReferralBonusesCron();

const gracefulShutdown = (signal: string) => {
  console.log(`[${signal}] Shutting down gracefully...`);
  cronTask?.stop();
  expireBonusesCron.stop();
  server.close(async () => {
    try {
      await Promise.all([pool.end(), closeCacheClient()]);
      console.log('PostgreSQL pool + Redis fermés. Exiting.');
    } catch (e) {
      console.error('Error closing connections:', e);
    }
    process.exit(0);
  });
  // Force-kill after 10 s if connections hang
  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
