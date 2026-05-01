import * as https from 'https';
import * as http from 'http';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import pool from '../db/pool';

export interface OpportunitiesScrapeJob {
  id: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'stopped';
  startedAt: string;
  finishedAt?: string;
  logs: string[];
  summary?: {
    sources: number;
    fetched: number;
    inserted: number;
    duplicates: number;
    failed: number;
  };
  error?: string;
}

type SourceRow = {
  id: string;
  name: string;
  base_url: string;
  list_url: string;
  parser: 'generic_html' | 'rss';
  is_active: boolean;
  rate_limit_ms: number;
  notes?: string | null;
};

const jobs = new Map<string, OpportunitiesScrapeJob>();
let activeJobId: string | null = null;

function isCampusFranceCatalogueUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('cataloguelm.campusfrance.org')) return false;
    return /\/(master|licence)\//i.test(u.pathname);
  } catch {
    return false;
  }
}

function isPastelEtudesEnFranceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== 'pastel.diplomatie.gouv.fr') return false;
    return u.pathname.startsWith('/etudesenfrance/');
  } catch {
    return false;
  }
}

function isCampusFranceCatalogueProgramUrl(url: string): boolean {
  if (!isCampusFranceCatalogueUrl(url)) return false;
  return /(?:#\/program\/|%23\/program\/|\/program\/)(\d+)/i.test(url);
}

function isCampusFranceCatalogueIndexUrl(url: string): boolean {
  if (!isCampusFranceCatalogueUrl(url)) return false;
  if (isCampusFranceCatalogueProgramUrl(url)) return false;
  // anything else under /master/ or /licence/ should be treated as catalogue index (SPA)
  return true;
}

function parseKeywordsFromNotes(notes?: string | null): string[] {
  const raw = (notes || '').match(/\bkeywords\s*=\s*([^\n]+)/i)?.[1] || '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 32));
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function log(job: OpportunitiesScrapeJob, msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  job.logs.push(line);
  if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function fetchRaw(url: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}, _redirectDepth = 0): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: {
        'User-Agent': 'StudaraBot/1.0 (+https://studara.app)',
        'Accept': 'text/html,application/xml,application/rss+xml,application/json,*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Connection': 'keep-alive',
        ...opts.headers,
      },
    };

    const req = client.request(options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        if (_redirectDepth >= 5) {
          reject(new Error(`Too many redirects: ${url}`));
          return;
        }
        const loc = res.headers.location;
        const redirectUrl = loc.startsWith('http') ? loc : `${parsed.protocol}//${parsed.host}${loc}`;
        resolve(fetchRaw(redirectUrl, opts, _redirectDepth + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        // Some public pages (e.g., pastel.diplomatie.gouv.fr) do a JS redirect to attach jsessionid/sctxid.
        const jsRedirect = body.match(/document\.location\.replace\(\"([^\"]+)\"\)/i)?.[1];
        if (jsRedirect && _redirectDepth < 5) {
          const redirectUrl = jsRedirect.startsWith('http')
            ? jsRedirect
            : `${parsed.protocol}//${parsed.host}${jsRedirect}`;
          resolve(fetchRaw(redirectUrl, opts, _redirectDepth + 1));
          return;
        }
        resolve({ status: res.statusCode || 0, body });
      });
      res.on('error', reject);
    });
    req.setTimeout(25000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function normalizeUrl(baseUrl: string, href: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function pickText($: cheerio.CheerioAPI, el: AnyNode, max = 240): string {
  const t = $(el).text().replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function extractCandidateLinks(html: string, source: SourceRow): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = String($(el).attr('href') || '').trim();
    if (!href) return;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    const abs = normalizeUrl(source.base_url || source.list_url, href);
    // Heuristic: keep only same-site links and drop obvious category/nav links
    try {
      const u = new URL(abs);
      const base = new URL(source.base_url);
      if (u.hostname !== base.hostname) return;
      const path = (u.pathname || '').toLowerCase();
      if (path === '/' || path.length < 2) return;
      if (/login|signup|connexion|contact|privacy|terms|mentions|cookies/.test(path)) return;
      if (/accessibility|accessibilite|sitemap|plan-du-site|rss|feed|tag\//.test(path)) return;

      // Prefer French pages when possible (avoid /en/ /es/ /de/ etc.)
      if (/(^|\/)(en|es|de|it|pt|ar)(\/|$)/.test(path) && !/(^|\/)fr(\/|$)/.test(path)) return;

      // Avoid obvious listing filters/categories on Campus France (too broad/noisy)
      if (u.hostname.includes('campusfrance.org')) {
        if (/\/fr\/recherche\/(type|theme)\//.test(path)) return;
      }

      // Keep hash-routing URLs for Campus France catalog (SPA uses #/program/ID).
      if (u.hostname.includes('cataloguelm.campusfrance.org')) {
        links.add(u.toString());
      } else if (u.hostname === 'pastel.diplomatie.gouv.fr') {
        // Pastel uses query params (sctxid/_csrf/idFormation/...) as part of navigation.
        // Keep them (do NOT strip # or query).
        links.add(u.toString());
      } else {
        links.add(u.toString().split('#')[0]);
      }
    } catch {
      // ignore
    }
  });

  return Array.from(links).slice(0, 120); // safety cap per source
}

function stripTextNoise(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

async function resolveFrenchVariantUrl(url: string, html: string): Promise<string> {
  try {
    const $ = cheerio.load(html);
    const lang = String($('html').attr('lang') || '').toLowerCase();
    if (lang.startsWith('fr')) return url;

    // Prefer explicit French alternate links if present
    const alt =
      $('link[rel="alternate"][hreflang="fr"]').attr('href') ||
      $('link[rel="alternate"][hreflang="fr-FR"]').attr('href') ||
      $('link[rel="alternate"][hreflang="fr-fr"]').attr('href');
    if (alt) return normalizeUrl(url, String(alt));
  } catch {
    // ignore
  }
  return url;
}

async function scrapeDetailGenericHtml(url: string): Promise<Partial<DbOpportunity> | null> {
  let { status, body } = await fetchRaw(url);
  if (status >= 400) return null;
  // If we landed on a non-FR variant and the page exposes a FR alternate, refetch it.
  const frUrl = await resolveFrenchVariantUrl(url, body);
  if (frUrl !== url) {
    const r2 = await fetchRaw(frUrl);
    if (r2.status < 400) {
      status = r2.status;
      body = r2.body;
      url = frUrl;
    }
  }

  const $ = cheerio.load(body);
  $('script, style, noscript, iframe').remove();

  // Site-specific: Études en France (Pastel) programme detail page
  try {
    const u = new URL(url);
    if (u.hostname === 'pastel.diplomatie.gouv.fr' && /\/etudesenfrance\/dyn\/public\/examinerFormation\.html/i.test(u.pathname)) {
      const title =
        stripTextNoise($('h1').first().text()) ||
        stripTextNoise($('h2').first().text()) ||
        stripTextNoise($('title').first().text());
      if (!title || title.length < 4) return null;

      const fullText = stripTextNoise($('body').text());

      // Heuristic extraction for institution/city from labeled fields
      const pickAfterLabel = (labelRe: RegExp, max = 255): string | null => {
        const t = fullText;
        const m = t.match(labelRe);
        if (!m) return null;
        const s = stripTextNoise(m[1] || '').slice(0, max);
        return s || null;
      };

      // Try common French labels in the page
      const hostInstitution =
        pickAfterLabel(/(?:Établissement|Etablissement)\s*:\s*([^|•\n\r]{3,255})/i, 255) ||
        pickAfterLabel(/(?:École|Université)\s*:\s*([^|•\n\r]{3,255})/i, 255);
      const hostCity =
        pickAfterLabel(/(?:Ville)\s*:\s*([^|•\n\r]{2,120})/i, 120) ||
        pickAfterLabel(/(?:Commune)\s*:\s*([^|•\n\r]{2,120})/i, 120);

      // Pastel is a catalogue of programs; deadline is not exposed as a per-program date here.
      return {
        title: title.slice(0, 600),
        opportunity_type: 'program',
        provider_name: 'Études en France',
        host_country: 'France',
        host_city: hostCity,
        host_institution: hostInstitution,
        program_level: null,
        program_duration_text: null,
        program_duration_months: null,
        description: fullText.slice(0, 8000) || null,
        eligibility: null,
        benefits: null,
        has_scholarship: false,
        scholarship_details: null,
        apply_url: url,
        official_url: url,
        source_name: 'Études en France (catalogue)',
        source_url: 'https://pastel.diplomatie.gouv.fr/etudesenfrance/dyn/public/pageCatalogueFormation.html',
        deadline: null,
      };
    }
  } catch {
    // ignore
  }

  // Site-specific: Campus France formations catalogue
  try {
    const u = new URL(url);
    if (u.hostname.includes('cataloguelm.campusfrance.org')) {
      // Extract program id from SPA route (hash or encoded %23)
      const idMatch = url.match(/(?:#\/program\/|%23\/program\/|\/program\/)(\d+)/i);
      const programId = idMatch?.[1] || '';
      if (!programId) return null;

      const isMaster = /\/master\//i.test(u.pathname);
      const isLicence = /\/licence\//i.test(u.pathname);
      if (!isMaster && !isLicence) return null;

      const jsonUrl = isMaster
        ? `https://cataloguelm.campusfrance.org/master/ws/getmasterformjson.php?id=${encodeURIComponent(programId)}`
        : `https://cataloguelm.campusfrance.org/licence/ws/getlicformjson.php?id=${encodeURIComponent(programId)}`;

      const r = await fetchRaw(jsonUrl, { headers: { Accept: 'application/json', Referer: `${u.origin}${u.pathname}` } });
      if (r.status >= 400) return null;

      let data: any;
      try { data = JSON.parse(r.body); } catch { return null; }

      const form = data?.form || {};
      const etab = data?.etab || {};

      const label = stripTextNoise(String(form?.lf || '')).slice(0, 600);
      const levelRaw = stripTextNoise(String(form?.tf || '')).slice(0, 20); // e.g., "M2", "L1"
      const programLevel = levelRaw ? `Niveau ${levelRaw}` : null;

      const d = Number(form?.d);
      const td = Number(form?.td); // 1=years (observed), others unknown
      let programDurationText: string | null = null;
      let programDurationMonths: number | null = null;
      if (!isNaN(d) && d > 0) {
        if (td === 1) {
          programDurationText = `Durée : ${d} an${d > 1 ? 's' : ''}`;
          programDurationMonths = d * 12;
        } else {
          // fallback: treat as months when unsure
          programDurationText = `Durée : ${d} mois`;
          programDurationMonths = d;
        }
      }

      const hostInstitution = stripTextNoise(String(etab?.le || etab?.lo || '')).slice(0, 255) || null;
      const hostCity = stripTextNoise(String(etab?.lv || '')).slice(0, 120) || null;
      const officialUrl = url.includes('#') ? url : `${u.origin}${u.pathname}#/program/${programId}`;
      // Use the catalogue URL as canonical apply_url to guarantee stable deduping.
      // The external website link (form.fu / etab.url) may change and would create false "new" rows.
      const applyUrl = officialUrl;

      const hasScholarship = false;

      return {
        title: label || `Programme ${programId}`,
        opportunity_type: 'program',
        provider_name: 'Campus France',
        host_country: 'France',
        host_city: hostCity,
        host_institution: hostInstitution,
        program_level: programLevel,
        program_duration_text: programDurationText,
        program_duration_months: programDurationMonths,
        description: null,
        eligibility: null,
        benefits: null,
        has_scholarship: hasScholarship,
        scholarship_details: null,
        apply_url: applyUrl,
        official_url: officialUrl,
        source_name: 'Campus France (catalogue)',
        source_url: `${u.origin}${u.pathname}#/catalog?lang=fr`,
        deadline: null,
      };
    }
  } catch {
    // ignore
  }

  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
  const title = stripTextNoise((ogTitle || $('title').first().text().trim()).replace(/\s+/g, ' '));
  if (!title || title.length < 5) return null;

  const ogDesc = $('meta[property="og:description"]').attr('content')?.trim();
  const metaDesc = $('meta[name="description"]').attr('content')?.trim();
  const desc = stripTextNoise((ogDesc || metaDesc || '').trim());

  const text = stripTextNoise($('body').text());

  // Attempt to find a deadline date in common formats (YYYY-MM-DD or DD/MM/YYYY)
  let deadline: string | null = null;
  const mIso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (mIso) deadline = `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  if (!deadline) {
    const mFr = text.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/);
    if (mFr) {
      const dd = String(mFr[1]).padStart(2, '0');
      const mm = String(mFr[2]).padStart(2, '0');
      deadline = `${mFr[3]}-${mm}-${dd}`;
    }
  }

  // Pick first “apply” link if present
  let applyUrl: string | null = null;
  $('a[href]').each((_, el) => {
    if (applyUrl) return;
    const href = String($(el).attr('href') || '').trim();
    if (!href) return;
    const label = stripTextNoise(pickText($, el, 120)).toLowerCase();
    if (/(postuler|candidature|apply|application|inscription|candidate)/i.test(label)) {
      applyUrl = normalizeUrl(url, href);
    }
  });

  return {
    title: title.slice(0, 600),
    opportunity_type: 'other',
    program_level: null,
    program_duration_text: null,
    program_duration_months: null,
    description: stripTextNoise(desc || text.slice(0, 2500)).slice(0, 8000),
    eligibility: null,
    benefits: null,
    has_scholarship: false,
    scholarship_details: null,
    apply_url: applyUrl || url,
    official_url: url,
    source_name: null,
    source_url: null,
    deadline: deadline,
  };
}

function parseRssItems(xml: string): Array<{ title: string; link: string; description?: string }> {
  // Very small RSS/Atom parser (no external dependency).
  const items: Array<{ title: string; link: string; description?: string }> = [];

  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks.slice(0, 200)) {
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const desc = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    if (title && link) items.push({ title, link, description: desc });
  }

  // Atom fallback
  if (items.length === 0) {
    const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
    for (const block of entryBlocks.slice(0, 200)) {
      const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const href = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] || '';
      const summary = (block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      if (title && href) items.push({ title, link: href, description: summary });
    }
  }

  return items;
}

type DbOpportunity = {
  title: string;
  opportunity_type: string;
  provider_name: string | null;
  host_country: string | null;
  host_city: string | null;
  host_institution: string | null;
  program_level: string | null;
  program_duration_text: string | null;
  program_duration_months: number | null;
  description: string | null;
  eligibility: string | null;
  benefits: string | null;
  has_scholarship: boolean;
  scholarship_details: string | null;
  apply_url: string | null;
  official_url: string | null;
  source_name: string | null;
  source_url: string | null;
  deadline: string | null;
};

async function insertPendingOpportunity(row: DbOpportunity, extractedBy: string) {
  // Dedup mainly by apply_url unique index (NULL allowed).
  await pool.query(
    `INSERT INTO opportunities
       (title, opportunity_type, provider_name, host_country, host_city, host_institution,
        program_level, program_duration_text, program_duration_months,
        description, eligibility, benefits, has_scholarship, scholarship_details,
        apply_url, official_url, source_name, source_url, deadline,
        status, is_active, extracted_by, extracted_at)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pending',TRUE,$20,NOW())
     ON CONFLICT DO NOTHING`,
    [
      row.title,
      row.opportunity_type,
      row.provider_name,
      row.host_country,
      row.host_city,
      row.host_institution,
      row.program_level,
      row.program_duration_text,
      row.program_duration_months,
      row.description,
      row.eligibility,
      row.benefits,
      row.has_scholarship,
      row.scholarship_details,
      row.apply_url,
      row.official_url,
      row.source_name,
      row.source_url,
      row.deadline,
      extractedBy,
    ],
  );
}

async function listCampusFranceCatalogueProgramIds(params: {
  kind: 'master' | 'licence';
  keywords: string[];
  job: OpportunitiesScrapeJob;
}): Promise<number[]> {
  const { kind, keywords, job } = params;
  const ids = new Set<number>();

  const wsBase =
    kind === 'master'
      ? 'https://cataloguelm.campusfrance.org/master/ws/getmasterwkwjson.php'
      : 'https://cataloguelm.campusfrance.org/licence/ws/getlicwkwjson.php';

  for (const kw of keywords) {
    try {
      const url = `${wsBase}?listkeys=${encodeURIComponent(kw)}`;
      const r = await fetchRaw(url, { headers: { Accept: 'application/json' } });
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
      const data = JSON.parse(r.body);
      const programs: any[] = Array.isArray(data?.programs) ? data.programs : [];
      const before = ids.size;
      for (const p of programs) {
        const idNum = Number(p?.id);
        if (!Number.isFinite(idNum) || idNum <= 0) continue;
        ids.add(idNum);
      }
      const added = ids.size - before;
      log(job, `  → [${kind}] keyword="${kw}" total=${Number(data?.total ?? programs.length)} ids+${added} (ids=${ids.size})`);
      await sleep(120);
    } catch (e: any) {
      log(job, `  ⚠️ [${kind}] keyword="${kw}" → ${e.message}`);
      await sleep(250);
    }
  }

  return Array.from(ids.values());
}

export async function startOpportunitiesScrape(extractedByUserId: string): Promise<string> {
  if (activeJobId && jobs.get(activeJobId)?.status === 'running') {
    return activeJobId;
  }

  const jobId = makeId();
  const job: OpportunitiesScrapeJob = {
    id: jobId,
    status: 'pending',
    startedAt: new Date().toISOString(),
    logs: [],
  };
  jobs.set(jobId, job);
  activeJobId = jobId;

  setImmediate(async () => {
    job.status = 'running';
    log(job, '🕷️ Démarrage du scraping opportunités...');

    const summary = { sources: 0, fetched: 0, inserted: 0, duplicates: 0, failed: 0 };

    try {
      const { rows } = await pool.query(
        `SELECT id, name, base_url, list_url, parser, is_active, rate_limit_ms, notes
         FROM opportunity_sources
         WHERE is_active = TRUE
         ORDER BY created_at ASC`,
      );
      const sources = (rows as SourceRow[]) || [];
      // Scrape only supported sources (Campus France catalogue + Pastel Études en France)
      const filteredSources = sources.filter((s) =>
        isCampusFranceCatalogueUrl(s.list_url) ||
        isCampusFranceCatalogueUrl(s.base_url) ||
        isPastelEtudesEnFranceUrl(s.list_url) ||
        isPastelEtudesEnFranceUrl(s.base_url),
      );
      summary.sources = filteredSources.length;

      if (!filteredSources.length) {
        log(job, '⚠️ Aucune source active compatible trouvée (Campus France catalogue / Pastel).');
        job.status = 'done';
        job.finishedAt = new Date().toISOString();
        job.summary = summary;
        return;
      }

      for (const src of filteredSources) {
        log(job, `📄 Source: ${src.name} (${src.parser})`);
        await sleep(Math.max(100, src.rate_limit_ms || 700));

        let listBody = '';
        let masterCatalogueIds: number[] | null = null;
        let licenceCatalogueIds: number[] | null = null;

        // Catalogue index pages are SPAs; don't extract HTML links. Use ws API to list IDs.
        try {
          if (isCampusFranceCatalogueIndexUrl(src.list_url)) {
            const isMaster = /\/master\//i.test(new URL(src.list_url).pathname);
            const isLicence = /\/licence\//i.test(new URL(src.list_url).pathname);

            const defaultKeywords = isMaster
              ? ['mas', 'pro', 'ing', 'eco', 'inf', 'par', 'ent', 'eur', 'bio', 'art', 'med']
              : ['lic', 'pro', 'ing', 'eco', 'inf', 'par', 'ent', 'eur', 'bio', 'art', 'med'];

            const kw = parseKeywordsFromNotes(src.notes) || [];
            const keywords = kw.length ? kw : defaultKeywords;

            log(job, `  → Catalogue ${isMaster ? 'master' : isLicence ? 'licence' : 'unknown'}: récupération des IDs... (${keywords.length} keywords)`);
            if (isMaster) masterCatalogueIds = await listCampusFranceCatalogueProgramIds({ kind: 'master', keywords, job });
            if (isLicence) licenceCatalogueIds = await listCampusFranceCatalogueProgramIds({ kind: 'licence', keywords, job });
          } else if (isCampusFranceCatalogueProgramUrl(src.list_url)) {
            // Single program URL: no listBody needed.
            listBody = '';
          } else {
            const r = await fetchRaw(src.list_url);
            if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
            listBody = r.body;
          }
        } catch (e: any) {
          summary.failed += 1;
          log(job, `❌ Impossible de préparer list_url: ${e.message}`);
          continue;
        }

        if (src.parser === 'rss') {
          const rssItems = parseRssItems(listBody);
          log(job, `  → RSS items: ${rssItems.length}`);
          for (const it of rssItems.slice(0, 80)) {
            summary.fetched += 1;
            try {
              const url = normalizeUrl(src.base_url, it.link);
              const row: DbOpportunity = {
                title: it.title.slice(0, 600),
                opportunity_type: 'other',
                provider_name: src.name,
                host_country: null,
                host_city: null,
                host_institution: null,
                program_level: null,
                program_duration_text: null,
                program_duration_months: null,
                description: it.description ? it.description.replace(/\s+/g, ' ').trim().slice(0, 8000) : null,
                eligibility: null,
                benefits: null,
                has_scholarship: /\bbourse(s)?\b/i.test(`${it.title} ${(it.description || '')}`),
                scholarship_details: null,
                apply_url: url,
                official_url: url,
                source_name: src.name,
                source_url: src.list_url,
                deadline: null,
              };
              const before = await pool.query(
                `SELECT 1 FROM opportunities WHERE apply_url = $1 OR official_url = $1 LIMIT 1`,
                [row.apply_url],
              );
              if (before.rows.length) {
                summary.duplicates += 1;
                continue;
              }
              await insertPendingOpportunity(row, extractedByUserId);
              summary.inserted += 1;
            } catch (e: any) {
              summary.failed += 1;
              log(job, `  ❌ RSS insert error: ${e.message}`);
            }
          }
          continue;
        }

        // generic_html
        const candidates =
          masterCatalogueIds && masterCatalogueIds.length
            ? masterCatalogueIds.map((id) => `https://cataloguelm.campusfrance.org/master/#/program/${id}`)
            : licenceCatalogueIds && licenceCatalogueIds.length
              ? licenceCatalogueIds.map((id) => `https://cataloguelm.campusfrance.org/licence/#/program/${id}`)
              : isCampusFranceCatalogueProgramUrl(src.list_url)
                ? [src.list_url]
                : extractCandidateLinks(listBody, src);
        log(job, `  → Liens candidats: ${candidates.length}`);

        for (const url of candidates) {
          await sleep(120);
          summary.fetched += 1;
          try {
            // cheap dedup check
            const before = await pool.query(
              `SELECT 1 FROM opportunities WHERE apply_url = $1 OR official_url = $1 LIMIT 1`,
              [url],
            );
            if (before.rows.length) { summary.duplicates += 1; continue; }

            const detail = await scrapeDetailGenericHtml(url);
            if (!detail?.title) { summary.failed += 1; continue; }

            const row: DbOpportunity = {
              title: detail.title!,
              opportunity_type: String((detail as any).opportunity_type || 'other'),
              provider_name: (detail as any).provider_name ?? src.name,
              host_country: (detail as any).host_country ?? null,
              host_city: (detail as any).host_city ?? null,
              host_institution: (detail as any).host_institution ?? null,
              program_level: (detail as any).program_level ?? null,
              program_duration_text: (detail as any).program_duration_text ?? null,
              program_duration_months: (detail as any).program_duration_months ?? null,
              description: (detail.description || null) as any,
              eligibility: null,
              benefits: null,
              has_scholarship: !!(detail as any).has_scholarship,
              scholarship_details: (detail as any).scholarship_details ?? null,
              apply_url: (detail.apply_url || url) as any,
              official_url: (detail.official_url || url) as any,
              source_name: (detail as any).source_name ?? src.name,
              source_url: (detail as any).source_url ?? src.list_url,
              deadline: (detail.deadline || null) as any,
            };

            await insertPendingOpportunity(row, extractedByUserId);
            summary.inserted += 1;
          } catch (e: any) {
            summary.failed += 1;
            log(job, `  ❌ ${url} → ${e.message}`);
          }
        }
      }

      job.status = 'done';
      job.finishedAt = new Date().toISOString();
      job.summary = summary;
      log(job, `✅ Terminé. Inserted=${summary.inserted}, Duplicates=${summary.duplicates}, Failed=${summary.failed}`);
    } catch (e: any) {
      job.status = 'error';
      job.finishedAt = new Date().toISOString();
      job.error = e.message ?? String(e);
      log(job, `💥 Fatal: ${job.error}`);
    } finally {
      activeJobId = null;
    }
  });

  return jobId;
}

export function getOpportunitiesScrapeJob(jobId: string): OpportunitiesScrapeJob | undefined {
  return jobs.get(jobId);
}

export function listOpportunitiesScrapeJobs(): OpportunitiesScrapeJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

// Auto-cleanup jobs older than 24h
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (new Date(job.startedAt).getTime() < cutoff) jobs.delete(id);
  }
}, 60 * 60 * 1000);

