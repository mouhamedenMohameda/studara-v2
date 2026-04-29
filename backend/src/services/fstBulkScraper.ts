import { scrapeFstStudentData, getYearFromProfile } from './fstScraper';
import pool from '../db/pool';

export interface BulkScrapeStatus {
  status: 'idle' | 'running' | 'done' | 'stopped';
  startNum: number;
  endNum:   number;
  current:  number;
  progress: number; // 0-100
  found:    number;
  inserted: number;
  skipped:  number;
  errors:   number;
  startedAt: string | null;
  log: string[];
}

let state: BulkScrapeStatus = {
  status:    'idle',
  startNum:  29000,
  endNum:    35000,
  current:   29000,
  progress:  0,
  found:     0,
  inserted:  0,
  skipped:   0,
  errors:    0,
  startedAt: null,
  log:       [],
};

const LOG_LIMIT = 300;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const addLog = (msg: string) => {
  state.log.unshift(`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`);
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
};

export const getBulkStatus = (): BulkScrapeStatus => ({ ...state, log: [...state.log] });

export const stopBulkScrape = (): void => {
  if (state.status === 'running') {
    state.status = 'stopped';
    addLog("⛔ Arrêté par l'admin");
  }
};

export const startBulkScrape = (startNum: number, endNum: number, adminId: string): void => {
  if (state.status === 'running') return;

  state = {
    status:    'running',
    startNum,
    endNum,
    current:   startNum,
    progress:  0,
    found:     0,
    inserted:  0,
    skipped:   0,
    errors:    0,
    startedAt: new Date().toISOString(),
    log:       [],
  };
  addLog(`🚀 Démarré C${startNum} → C${endNum} (${endNum - startNum + 1} numéros à tester)`);

  // Fire-and-forget — runs entirely in background
  (async () => {
    const total = endNum - startNum + 1;

    for (let n = startNum; n <= endNum; n++) {
      if (state.status !== 'running') break;

      state.current  = n;
      state.progress = Math.round(((n - startNum) / total) * 100);

      const code = `C${String(n).padStart(5, '0')}`;
      try {
        const data = await scrapeFstStudentData(code);

        if (!data.studentName || data.courses.length === 0) {
          state.errors++;
          await sleep(150);
          continue;
        }

        state.found++;
        const year = getYearFromProfile(data.profile);
        addLog(`✅ ${code} — ${data.studentName} (${data.profile}) — ${data.courses.length} cours`);

        for (const course of data.courses) {
          // Use a stable key based on course code + year so duplicates are skipped
          const fileUrl = `fst://una/sciences/${year}/${course.code}`;

          const exists = await pool.query(
            'SELECT id FROM resources WHERE file_url = $1 LIMIT 1',
            [fileUrl]
          );
          if (exists.rows.length > 0) {
            state.skipped++;
            continue;
          }

          await pool.query(
            `INSERT INTO resources
               (title, title_ar, description, resource_type, faculty, university,
                subject, year, file_url, file_name, file_type, uploaded_by, status, tags)
             VALUES ($1, $2, $3, 'note', 'sciences', 'una', $4, $5, $6, $7, 'pdf', $8, 'approved', $9)`,
            [
              course.title,
              course.title,
              `Matière importée du portail UNA FST — Code: ${course.code}`,
              course.title,   // subject
              year,
              fileUrl,
              `${course.code}.pdf`,
              adminId,
              ['fst', 'catalog', 'una', course.code.toLowerCase()],
            ]
          );
          state.inserted++;
        }
      } catch (err: any) {
        const msg: string = err?.message ?? '';
        // "No data found" is expected for most numbers — don't spam the log
        if (!msg.includes('No data found') && !msg.includes('No student')) {
          addLog(`⚠️  ${code}: ${msg.slice(0, 100)}`);
        }
        state.errors++;
      }

      // Respectful delay — ~350 ms between students
      await sleep(350);
    }

    if (state.status === 'running') {
      state.status   = 'done';
      state.progress = 100;
      addLog(
        `🏁 Terminé! ${state.found} étudiants trouvés, ${state.inserted} cours insérés, ` +
        `${state.skipped} ignorés (déjà présents), ${state.errors} numéros vides`
      );
    }
  })().catch(err => {
    state.status = 'stopped';
    addLog(`💥 Erreur fatale: ${err?.message}`);
  });
};
