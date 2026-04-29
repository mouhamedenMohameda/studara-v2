/**
 * Scheduled job: scrape techghil.mr for new job listings every day at midnight.
 *
 * Also auto-deactivates jobs whose deadline has passed before each scrape run.
 *
 * Enabled only when SCRAPER_ENABLED=true in the environment.
 * The scraper needs ADMIN_EMAIL and ADMIN_PASSWORD to be set as well.
 *
 * Registered automatically from src/index.ts.
 */

import cron, { ScheduledTask } from 'node-cron';
import { scrapeJobsMain } from '../scripts/scrapeJobs';
import pool from '../db/pool';

let isRunning = false;

/** Marks jobs with a passed deadline as inactive. */
async function deactivateExpiredJobs(): Promise<void> {
  try {
    const { rowCount } = await pool.query(
      `UPDATE jobs SET is_active = FALSE
       WHERE is_active = TRUE
         AND deadline IS NOT NULL
         AND deadline < CURRENT_DATE`
    );
    if (rowCount && rowCount > 0) {
      console.log(`[scrapeJobsCron] Deactivated ${rowCount} expired job(s).`);
    }
  } catch (err) {
    console.error('[scrapeJobsCron] Failed to deactivate expired jobs:', (err as Error).message);
  }
}

/**
 * Registers the daily scrape cron job.
 * Returns a handle to `.stop()` the job (useful in tests / graceful shutdown).
 */
export function registerScrapeJobsCron(): ScheduledTask {
  // Run at midnight every day (server timezone)
  const task = cron.schedule('0 0 * * *', async () => {
    if (isRunning) {
      console.warn('[scrapeJobsCron] Previous run still in progress — skipping.');
      return;
    }
    isRunning = true;
    console.log('[scrapeJobsCron] Starting midnight job scrape...');
    try {
      // 1. Clean up expired jobs first
      await deactivateExpiredJobs();
      // 2. Scrape new jobs
      await scrapeJobsMain();
      console.log('[scrapeJobsCron] Midnight job scrape completed.');
    } catch (err) {
      console.error('[scrapeJobsCron] Scrape failed:', (err as Error).message);
    } finally {
      isRunning = false;
    }
  });

  console.log('[scrapeJobsCron] Registered — will run daily at midnight.');
  return task;
}
