#!/usr/bin/env node
/**
 * Minimal health checker for local dev.
 *
 * Usage:
 *   node scripts/check-health.mjs http://localhost:3000/health http://localhost:3101/api/v1/health
 */

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('Usage: node scripts/check-health.mjs <url1> [url2...]');
  process.exit(1);
}

async function check(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'GET' });
    const ms = Date.now() - started;
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, url, status: res.status, ms, body: text.slice(0, 200) };
    }
    return { ok: true, url, status: res.status, ms };
  } catch (e) {
    const ms = Date.now() - started;
    return { ok: false, url, status: 0, ms, error: String(e) };
  }
}

const results = await Promise.all(urls.map(check));
for (const r of results) {
  if (r.ok) {
    console.log(`[OK]   ${r.status} ${r.ms}ms  ${r.url}`);
  } else {
    console.log(`[FAIL] ${r.status} ${r.ms}ms  ${r.url}`);
    if (r.body) console.log(`       body: ${r.body}`);
    if (r.error) console.log(`       error: ${r.error}`);
  }
}

if (results.some(r => !r.ok)) process.exit(2);

