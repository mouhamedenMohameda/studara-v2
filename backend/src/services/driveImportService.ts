import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface DriveImportJob {
  id: string;
  status: 'pending' | 'listing' | 'importing' | 'done' | 'error';
  driveUrl: string;
  faculty: string;
  year: number;
  university: string;
  startedAt: string;
  finishedAt?: string;
  logs: string[];
  summary?: {
    listed: number;
    inserted: number;
    duplicates: number;
    errors: number;
    subjects: Record<string, number>;
    byType: Record<string, number>;
  };
  error?: string;
}

const jobs = new Map<string, DriveImportJob>();

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const PYTHON_SCRIPT = path.join(__dirname, '..', 'scripts', 'drive_import.py');

export function startDriveImport(
  driveUrl: string,
  faculty: string,
  year: number,
  university: string,
  adminToken: string,
  apiBaseUrl: string
): string {
  const jobId = makeId();

  const job: DriveImportJob = {
    id: jobId,
    status: 'pending',
    driveUrl,
    faculty,
    year,
    university,
    startedAt: new Date().toISOString(),
    logs: [],
  };
  jobs.set(jobId, job);

  // Run Python script asynchronously
  setImmediate(() => {
    job.status = 'listing';
    job.logs.push(`[${new Date().toISOString()}] Démarrage du listing Drive...`);

    const args = [
      PYTHON_SCRIPT,
      '--url', driveUrl,
      '--faculty', faculty,
      '--year', String(year),
      '--university', university,
      '--api', apiBaseUrl,
      '--token', adminToken,
    ];

    const proc = spawn('python3', args, { timeout: 30 * 60 * 1000 }); // 30 min max

    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        job.logs.push(line);
        // Parse status updates from Python
        if (line.startsWith('STATUS:')) {
          const s = line.slice(7).trim() as DriveImportJob['status'];
          job.status = s;
        }
        // Parse final summary JSON
        if (line.startsWith('SUMMARY:')) {
          try {
            job.summary = JSON.parse(line.slice(8).trim());
          } catch {}
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      job.finishedAt = new Date().toISOString();
      if (code === 0 && job.summary) {
        job.status = 'done';
        job.logs.push(`[${job.finishedAt}] ✅ Import terminé.`);
      } else {
        job.status = 'error';
        job.error = stderr.slice(-500) || `Process exited with code ${code}`;
        job.logs.push(`[${job.finishedAt}] ❌ Erreur: ${job.error}`);
      }
    });

    proc.on('error', (err) => {
      job.status = 'error';
      job.error = err.message;
      job.finishedAt = new Date().toISOString();
      job.logs.push(`❌ Impossible de lancer Python: ${err.message}`);
    });
  });

  return jobId;
}

export function getJob(jobId: string): DriveImportJob | undefined {
  return jobs.get(jobId);
}

export function listJobs(): DriveImportJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

// Auto-cleanup jobs older than 24h
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (new Date(job.startedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}, 60 * 60 * 1000);
