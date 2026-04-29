/**
 * Techghil.mr Job Scraper
 * Scrapes job listings from https://www.techghil.mr and inserts them via the API.
 *
 * Run:
 *   cd /Users/mohameda/Desktop/tawjeeh/api
 *   npx ts-node src/scripts/scrapeJobs.ts
 */

import * as https from 'https';
import * as http from 'http';
import * as cheerio from 'cheerio';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

// ─── Config ────────────────────────────────────────────────────────────────────

const API_BASE = 'http://radar-mr.com/api/v1';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`[FATAL] Environment variable ${key} is required but not set.`);
    process.exit(1);
  }
  return val;
}

const ADMIN_EMAIL = requireEnv('ADMIN_EMAIL');
const ADMIN_PASS  = requireEnv('ADMIN_PASSWORD');
const DELAY_MS    = 450;   // ms between requests (be polite)
const MAX_PAGES   = 150;   // safety limit for listing page pagination

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchRaw(url: string, opts: { method?: string; body?: string; headers?: Record<string,string> } = {}, _redirectDepth = 0): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client  = parsed.protocol === 'https:' ? https : http;
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   opts.method || 'GET',
      headers: {
        'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122',
        'Accept':       'text/html,application/json,*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Connection':   'keep-alive',
        ...opts.headers,
      },
    };

    const req = client.request(options, (res) => {
      // Follow redirects (up to 5)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        if (_redirectDepth >= 5) {
          reject(new Error(`Too many redirects: ${url}`));
          return;
        }
        const loc = res.headers.location;
        const redirectUrl = loc.startsWith('http') ? loc : `${parsed.protocol}//${parsed.host}${loc}`;
        return resolve(fetchRaw(redirectUrl, opts, _redirectDepth + 1));
      }

      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end',  () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });

    req.setTimeout(20000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function fetchHtml(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const { body } = await fetchRaw(url);
      return body;
    } catch (err) {
      if (i === retries) throw err;
      await sleep(1500 * (i + 1));
    }
  }
  return '';
}

async function apiPost(path: string, body: Record<string, unknown>, token: string): Promise<unknown> {
  const payload = JSON.stringify(body);
  const { status, body: resp } = await fetchRaw(`${API_BASE}${path}`, {
    method: 'POST',
    body: payload,
    headers: {
      'Content-Type':  'application/json',
      'Content-Length': String(Buffer.byteLength(payload)),
      'Authorization': `Bearer ${token}`,
    },
  });
  if (status >= 400) throw new Error(`API ${status}: ${resp.substring(0, 200)}`);
  return JSON.parse(resp);
}

async function apiGet(path: string, token: string): Promise<unknown[]> {
  const { status, body } = await fetchRaw(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (status >= 400) {
    console.error(`  [apiGet ${path}] HTTP ${status}: ${body.substring(0, 120)}`);
    return [];
  }
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) return parsed;
    // Handle paginated responses: { data: [], total, page, limit }
    if (parsed && Array.isArray((parsed as any).data)) return (parsed as any).data;
    return [];
  } catch { return []; }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Admin login ───────────────────────────────────────────────────────────────

async function adminLogin(): Promise<string> {
  const payload = JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  const { status, body } = await fetchRaw(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: payload,
    headers: {
      'Content-Type':  'application/json',
      'Content-Length': String(Buffer.byteLength(payload)),
    },
  });
  if (status !== 200) throw new Error(`Login failed (${status}): ${body.substring(0, 200)}`);
  const data = JSON.parse(body);
  // The auth route returns { user, access, refresh } (makeTokens spreads { access, refresh })
  const token = (data.access || data.token || '') as string;
  if (!token || token.length < 20) throw new Error(`Login returned empty token. Response: ${body.substring(0, 200)}`);
  return token;
}

// ─── Parse helpers ─────────────────────────────────────────────────────────────

function parseDeadline(text: string): string | null {
  // DD-MM-YYYY → YYYY-MM-DD
  const m = text.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function detectJobType(title: string, desc: string): 'stage' | 'cdi' | 'cdd' | 'freelance' | 'other' {
  const t = (title + ' ' + desc).toLowerCase();
  if (/\bstage\b|stagiaire/.test(t))                                          return 'stage';
  if (/\bcdi\b|indéterminée|indéterminé/.test(t))                            return 'cdi';
  if (/\bcdd\b|déterminée|déterminé/.test(t))                                return 'cdd';
  if (/freelance|\bconsultant\b|\bmission indépendant/.test(t))              return 'freelance';
  return 'other';
}

function detectDomain(title: string, desc: string): string {
  const t = `${title} ${desc}`.toLowerCase();
  if (/développ|programmation|logiciel|\binformatique\b|\bIT\b|système|réseau|\bdata\b|digital|web\b|\bmobile\b|ui.ux|\bux\b|devops|cloud|cybersécurit|software|fullstack|full.stack/.test(t))
    return 'Informatique';
  if (/comptab|finance|audit|bilan|fiscalit|économ|trésorier|analyste financ/.test(t))
    return 'Finance & Comptabilité';
  if (/marketing|communicati|commerci|vente|relation client|\bpr\b|publicité|brand/.test(t))
    return 'Marketing & Commercial';
  if (/ingénieur|géologie|géologue|technicien|bâtiment|travaux|construction|mines|topograph|génie civil/.test(t))
    return 'Ingénierie & BTP';
  if (/ressources humaines|\brh\b|recrutement|formation|paie\b|talent/.test(t))
    return 'Ressources Humaines';
  if (/juridique|droit|avocat|notaire|légal|juriste/.test(t))
    return 'Juridique';
  if (/médecin|infirmier|santé|pharmacien|laboratoire|médical/.test(t))
    return 'Santé';
  if (/enseignant|professeur|formateur|éducation|enseignement/.test(t))
    return 'Éducation';
  if (/logistique|transport|supply|achat|approvisionnement|livraison/.test(t))
    return 'Logistique & Transport';
  if (/agriculture|agro|élevage|pêche|environnement/.test(t))
    return 'Agriculture';
  return 'Autre';
}

// ─── Clean page-chrome noise from scraped text ─────────────────────────────────

function stripPageNoise(s: string): string {
  // Remove JS function declarations (share buttons, analytics, etc.) — always at end
  s = s.replace(/\s*\bfunction\s+\w+\s*\([\s\S]*/i, '');
  // Remove "Source : XYZ" / "Partager" footer labels
  s = s.replace(/\s*\bSource\s*:\s*\w[^\n]*/gi, '');
  s = s.replace(/\s*\bPartager\b[^\n]*/gi, '');
  // Remove "Vue N fois" view counters
  s = s.replace(/\bVue\s+\d+[^\n]*/gi, '');
  // Remove pure URL strings that ended up inline
  s = s.replace(/https?:\/\/[^\s]{40,}/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

// ─── Extract offer URLs from any page ─────────────────────────────────────────

function extractOfferUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href*="/offres/show/"]').each((_, el) => {
    let href = $(el).attr('href') || '';
    href = href.split('?')[0]; // remove query string / lang param
    if (!href.startsWith('http')) href = `https://www.techghil.mr${href}`;
    urls.add(href);
  });
  return Array.from(urls);
}

// ─── Fetch ALL offer URLs via the DataTables AJAX endpoint ────────────────────
// https://www.techghil.mr/cms/getSearchDT/1  (type 1 = national offers)
// Returns: { draw, recordsTotal, recordsFiltered, data: [{id, donnee, date_publication}] }

const AJAX_HEADERS = {
  'User-Agent':        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122',
  'X-Requested-With':  'XMLHttpRequest',
  'Accept':            'application/json, text/javascript, */*; q=0.01',
  'Referer':           'https://www.techghil.mr/cms/search/offres?type=1',
  'Accept-Language':   'fr-FR,fr;q=0.9',
};
// DataTables requires at least one columns[] param or it returns "Server Error"
const AJAX_BASE_QS = 'search%5Bvalue%5D=&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=desc&columns%5B0%5D%5Bdata%5D=0&columns%5B0%5D%5Bname%5D=';

async function fetchAllUrlsViaAjax(): Promise<string[]> {
  const BATCH   = 100;
  const allUrls = new Set<string>();

  // First call — also tells us recordsTotal
  const firstUrl = `https://www.techghil.mr/cms/getSearchDT/1?draw=1&start=0&length=${BATCH}&${AJAX_BASE_QS}`;
  let firstData: { recordsTotal?: number; data?: Array<{ donnee: string }> };
  try {
    const { body } = await fetchRaw(firstUrl, { headers: AJAX_HEADERS });
    firstData = JSON.parse(body);
    if (!firstData.data) throw new Error(`Unexpected response: ${body.substring(0, 100)}`);
  } catch (e) {
    console.log(`  AJAX endpoint error: ${(e as Error).message}`);
    return [];
  }

  const total = firstData.recordsTotal ?? 0;
  console.log(`  AJAX: ${total} total offers on techghil.mr`);
  for (const row of (firstData.data || [])) extractOfferUrls(row.donnee).forEach(u => allUrls.add(u));
  console.log(`  Batch 1 → ${allUrls.size} URLs`);

  // Fetch remaining pages
  const batches = Math.ceil(total / BATCH);
  for (let i = 1; i < batches; i++) {
    const start = i * BATCH;
    const url   = `https://www.techghil.mr/cms/getSearchDT/1?draw=${i + 1}&start=${start}&length=${BATCH}&${AJAX_BASE_QS}`;
    process.stdout.write(`  Batch ${i + 1}/${batches} (${start}–${Math.min(start + BATCH, total)})... `);
    try {
      const { body } = await fetchRaw(url, { headers: AJAX_HEADERS });
      const bData: { data?: Array<{ donnee: string }> } = JSON.parse(body);
      for (const row of (bData.data || [])) extractOfferUrls(row.donnee).forEach(u => allUrls.add(u));
      console.log(`+${(bData.data || []).length} → ${allUrls.size} total`);
    } catch (e) { console.log(`error: ${(e as Error).message}`); }
    await sleep(DELAY_MS);
  }

  return Array.from(allUrls);
}



interface JobData {
  title:        string;
  company:      string;
  location:     string;
  domain:       string;
  jobType:      'stage' | 'cdi' | 'cdd' | 'freelance' | 'other';
  description:  string;
  requirements: string;
  applyUrl:     string;
  deadline:     string | null;
}

async function scrapeOfferDetail(url: string): Promise<JobData | null> {
  try {
    const html = await fetchHtml(url);
    const $    = cheerio.load(html);

    // Strip script / style / noscript so JS code never leaks into description text
    $('script, style, noscript, iframe, [class*="share"], [id*="share"]').remove();

    const text = $('body').text().replace(/\s+/g, ' ');

    // ── Title ──────────────────────────────────────────────────────────────
    // The title is in an <h5> tag that has no <a> child and isn't the reference
    let title = '';
    $('h5').each((_, el) => {
      const t = $(el).clone().find('a').remove().end().text().trim();
      if (t.length > 5 && !/Détails|Profil|Description/.test(t)) {
        // Remove reference like "O/KSR/1922" appended to title
        const clean = t.replace(/\s*O\/[A-Z]+\/\d+\s*$/, '').trim();
        if (clean.length > title.length) title = clean;
      }
    });
    // Fallback: h3 or h4
    if (!title) title = $('h3, h4').not(':has(a)').first().text().replace(/\s*O\/[A-Z]+\/\d+\s*$/, '').trim();
    if (!title) return null;

    // ── Company ────────────────────────────────────────────────────────────
    const company = $('h5 a, h4 a').first().text().trim() || 'Techghil';

    // ── Location ───────────────────────────────────────────────────────────
    let location = 'Mauritanie';
    const lieuMatch = text.match(/Lieu\s*:\s*([A-Za-zÀ-ÿ\s\-]{2,40}?)(?:\s*\d|\s*[A-Z]{5,}|\s*Vue)/);
    if (lieuMatch) location = lieuMatch[1].trim();

    // ── Full description block ─────────────────────────────────────────────
    let description = '';
    // Try to find the section containing "Description de l'offre"
    $('*').not('script, style, noscript').each((_, el) => {
      // Skip elements that are themselves or contain script tags
      if ($(el).find('script, style').length) return;
      const elText = $(el).text().trim();
      if (elText.includes("Description de l'offre") && elText.length > description.length && elText.length < 8000) {
        description = elText;
      }
    });
    if (description.length < 50) {
      // Fallback: grab the biggest text block
      description = text.substring(0, 3000);
    }

    // Strip page-chrome noise: "Source : Rimtic", "Partager", and any remaining JS artifacts
    description = stripPageNoise(description);
    

    // ── Requirements ──────────────────────────────────────────────────────
    let requirements = '';
    const profileIdx = text.indexOf('Profil recherché');
    if (profileIdx !== -1) {
      const deadlineIdx = text.indexOf('Date limite', profileIdx);
      const end = deadlineIdx !== -1 ? deadlineIdx : profileIdx + 1200;
      requirements = stripPageNoise(
        text.substring(profileIdx + 'Profil recherché'.length, end).trim().substring(0, 1500)
      );
    }

    // ── Deadline ──────────────────────────────────────────────────────────
    const deadlineMatch = text.match(/Date limite\s*:\s*(\d{2}-\d{2}-\d{4})/);
    const deadline = deadlineMatch ? parseDeadline(deadlineMatch[1]) : null;

    // ── Types & Domain ────────────────────────────────────────────────────
    const jobType = detectJobType(title, description.substring(0, 600));
    const domain  = detectDomain(title, description.substring(0, 600));

    return {
      title:        title.substring(0, 255),
      company:      company.substring(0, 255),
      location:     location.substring(0, 100),
      domain,
      jobType,
      description:  description.replace(/\s+/g, ' ').substring(0, 5000),
      requirements: requirements.replace(/\s+/g, ' ').substring(0, 1500),
      applyUrl:     url,
      deadline,
    };
  } catch (err) {
    return null;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('   🕷️  Techghil.mr Scraper — Studara');
  console.log('══════════════════════════════════════════');
  console.log('');

  // 1. Admin login
  process.stdout.write('🔑 Logging in as admin... ');
  let token: string;
  try {
    token = await adminLogin();
    console.log('✓');
  } catch (err) {
    console.error('✗\n', (err as Error).message);
    process.exit(1);
  }

  // 2. Fetch ALL already-stored apply_urls (for deduplication) — paginate to get everything
  process.stdout.write('📋 Loading existing jobs... ');
  const existingUrls = new Set<string>();
  let dedupPage = 1;
  while (true) {
    const batch = await apiGet(`/jobs?limit=500&page=${dedupPage}`, token) as Array<{ apply_url?: string }>;
    if (!batch.length) break;
    batch.forEach(j => { if (j.apply_url) existingUrls.add(j.apply_url); });
    if (batch.length < 500) break;
    dedupPage++;
  }
  console.log(`${existingUrls.size} already in DB`);

  // 3. Collect offer URLs — via AJAX endpoint (all offers), then homepage as fallback
  console.log('\n📄 Collecting offer URLs from techghil.mr...\n');
  const allUrls = new Set<string>();

  // Strategy A: AJAX DataTables endpoint (gets ALL offers)
  try {
    const ajaxUrls = await fetchAllUrlsViaAjax();
    ajaxUrls.forEach(u => allUrls.add(u));
    console.log(`\n  ✓ AJAX collected ${allUrls.size} offer URLs\n`);
  } catch (e) {
    console.log(`  AJAX failed: ${(e as Error).message}`);
  }

  // Strategy B: homepage (fallback, shows latest ~10)
  try {
    const homeHtml = await fetchHtml('https://www.techghil.mr/');
    const homeUrls = extractOfferUrls(homeHtml);
    homeUrls.forEach(u => allUrls.add(u));
    console.log(`  Homepage: +${homeUrls.length} URL(s) (total: ${allUrls.size})\n`);
  } catch { /* ignore */ }

  console.log(`✅ ${allUrls.size} unique offer URL(s) found`);

  if (allUrls.size === 0) {
    console.log('\n⚠️  No offer URLs found. Try re-running.\n');
    process.exit(0);
  }

  // 4. Filter out already-stored
  const urlsToScrape = Array.from(allUrls).filter(u => !existingUrls.has(u));
  console.log(`📝 ${urlsToScrape.length} new offer(s) to scrape (${allUrls.size - urlsToScrape.length} skipped as duplicates)\n`);

  if (urlsToScrape.length === 0) {
    console.log('✅ Database is already up to date!\n');
    process.exit(0);
  }

  // 5. Scrape + insert
  let inserted = 0, failed = 0;

  for (let i = 0; i < urlsToScrape.length; i++) {
    const url  = urlsToScrape[i];
    const slug = url.split('/offres/show/')[1]?.substring(0, 45) || url;
    process.stdout.write(`[${i + 1}/${urlsToScrape.length}] ${slug}... `);

    const job = await scrapeOfferDetail(url);
    if (!job) {
      console.log('✗ (parse failed)');
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    try {
      await apiPost('/jobs', {
        title:        job.title,
        company:      job.company,
        location:     job.location,
        domain:       job.domain,
        jobType:      job.jobType,
        description:  job.description,
        requirements: job.requirements,
        applyUrl:     job.applyUrl,
        deadline:     job.deadline ?? undefined,
      }, token);
      console.log(`✓ [${job.jobType}] ${job.company}`);
      inserted++;
    } catch (err) {
      console.log(`✗ API error: ${(err as Error).message.substring(0, 80)}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  // 6. Summary
  console.log('\n══════════════════════════════════════════');
  console.log(`✅ Inserted  : ${inserted}`);
  console.log(`❌ Failed    : ${failed}`);
  console.log(`⏭️  Skipped   : ${allUrls.size - urlsToScrape.length} (duplicates)`);
  console.log('══════════════════════════════════════════\n');
}

// Only auto-run when executed directly (not when imported as a module)
if (require.main === module) {
  main().catch((err) => {
    console.error('\n💥 Fatal error:', err.message);
    process.exit(1);
  });
}

export { main as scrapeJobsMain };
