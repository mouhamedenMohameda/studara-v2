#!/usr/bin/env node
/**
 * Bulk FST importer - runs ON the server, no network hop for API calls
 * Uses the DB directly + the scraper service
 */
const { Pool } = require('/var/www/studara/api/node_modules/pg');
const https = require('https');
const http  = require('http');

const pool = new Pool({ connectionString: 'postgresql://studara:Studara@2026@localhost:5432/studara' });

// ── Scraper (same logic as fstScraper.ts) ────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 10000 }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpPost(url, postData, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                 'Content-Length': Buffer.byteLength(postData), ...headers },
      timeout: 10000
    };
    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(postData);
    req.end();
  });
}

function extractText(html, selector) {
  // Simple regex-based extraction for span.couleurTetx1
  const matches = [];
  const re = /<span[^>]*class="[^"]*couleurTetx1[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push(m[1].replace(/<[^>]+>/g, '').trim());
  }
  return matches;
}

async function scrapeFST(studentNumber) {
  const baseUrl = 'http://resultats.una.mr/FST';
  // GET to get session cookies + ViewState
  let res = await httpGet(`${baseUrl}/pages/accueil.jsf`);
  const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const vsMatch = res.body.match(/id="javax\.faces\.ViewState"[^>]*value="([^"]+)"/);
  const viewState = vsMatch ? vsMatch[1] : 'j_id1';

  const postData = new URLSearchParams({
    'ecriture': 'ecriture',
    'ecriture:j_id79': studentNumber,
    'ecriture:j_id80': 'Consulter',
    'javax.faces.ViewState': viewState
  }).toString();

  res = await httpPost(`${baseUrl}/pages/accueil.jsf`, postData, {
    'Cookie': cookies,
    'Referer': `${baseUrl}/pages/accueil.jsf`
  });

  const texts = extractText(res.body, '.couleurTetx1');
  if (texts.length < 3) return null;

  const studentName = texts[0] || '';
  const profile     = texts[1] || '';

  // Extract table rows for courses
  const courses = [];
  const rowRe = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let rm;
  while ((rm = rowRe.exec(res.body)) !== null) {
    const code  = rm[1].replace(/<[^>]+>/g, '').trim();
    const title = rm[2].replace(/<[^>]+>/g, '').trim();
    if (code && title && code.length < 20 && title.length > 2) {
      courses.push({ code, title });
    }
  }

  if (!studentName || courses.length === 0) return null;
  return { studentNumber, studentName, profile, courses };
}

// ── DB insert ─────────────────────────────────────────────────────────────────
async function importStudent(data) {
  let inserted = 0, skipped = 0;
  const userId = (await pool.query("SELECT id FROM users WHERE email='admin@studara.app'")).rows[0]?.id;

  for (const c of data.courses) {
    const fileUrl = `http://resultats.una.mr/FST/#${data.studentNumber}-${c.code}`;
    const existing = await pool.query('SELECT id FROM resources WHERE file_url = $1', [fileUrl]);
    if (existing.rows.length > 0) { skipped++; continue; }

    // Determine year/level from profile
    const yearMatch = data.profile.match(/L(\d)/i);
    const year = yearMatch ? parseInt(yearMatch[1]) : 1;

    await pool.query(`
      INSERT INTO resources
        (title, description, resource_type, faculty, university, year, file_url, file_type, uploader_id, status, tags)
      VALUES ($1,$2,'summary','sciences','una',$3,$4,'link',$5,'approved',$6)
    `, [
      c.title,
      `${c.title} - ${data.profile} (${data.studentNumber})`,
      year,
      fileUrl,
      userId,
      JSON.stringify([c.code, 'fst', 'una', data.studentNumber.substring(0,4)])
    ]);
    inserted++;
  }
  return { inserted, skipped };
}

// ── Main: iterate student numbers ────────────────────────────────────────────
async function main() {
  const prefixes = ['C311','C321','C331','C341','C312','C322','C332','C342','C301','C302','C303'];
  const numbers  = [];
  for (const p of prefixes)
    for (let i = 1; i <= 150; i++)
      numbers.push(`${p}${String(i).padStart(2,'0')}`);

  console.log(`Starting bulk import: ${numbers.length} student numbers to try\n`);

  let found = 0, totalIns = 0, totalSkip = 0;
  for (const snum of numbers) {
    try {
      const data = await scrapeFST(snum);
      if (data) {
        const { inserted, skipped } = await importStudent(data);
        found++;
        totalIns  += inserted;
        totalSkip += skipped;
        process.stdout.write(`✅ [${String(found).padStart(3)}] ${snum} → ${data.studentName.substring(0,28).padEnd(28)} | +${inserted} new\n`);
      }
    } catch(e) {
      // skip errors silently
    }
    // tiny delay to avoid overwhelming resultats.una.mr
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Done! ${found} students found`);
  console.log(`   ${totalIns} courses inserted | ${totalSkip} already existed`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
