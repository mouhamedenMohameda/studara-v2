/**
 * Tawjeeh Performance Test Script
 * Simule N utilisateurs simultanés avec des IPs différentes
 * (contourne le rate limiter par IP comme en production réelle)
 */

const http = require('http');

const TARGET_HOST = '5.189.153.144';
const TARGET_PORT = 80;
const TARGET_PATH = '/api/v1/resources';
const PIPELINE    = 5; // requêtes en parallèle par "utilisateur"

function randomIp(seed) {
  // IPs fictives stables par utilisateur
  const a = 10 + (seed % 200);
  const b = (seed * 7) % 255;
  const c = (seed * 13) % 255;
  const d = (seed * 17) % 254 + 1;
  return `${a}.${b}.${c}.${d}`;
}

function runTest(concurrency, durationSec) {
  return new Promise((resolve) => {
    const stats = {
      total: 0, ok: 0, errors: 0, timeouts: 0,
      latencies: [], startTime: Date.now(),
    };

    let active = true;
    let inFlight = 0;

    function sendRequest(userId) {
      if (!active) return;
      inFlight++;
      const fakeIp = randomIp(userId);
      const reqStart = Date.now();

      const options = {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: TARGET_PATH,
        method: 'GET',
        headers: {
          'X-Forwarded-For': fakeIp,
          'X-Real-IP': fakeIp,
          'Connection': 'keep-alive',
        },
      };

      const req = http.request(options, (res) => {
        res.resume();
        res.on('end', () => {
          const latency = Date.now() - reqStart;
          stats.total++;
          stats.latencies.push(latency);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            stats.ok++;
          } else {
            stats.errors++;
          }
          inFlight--;
          if (active) sendRequest(userId);
        });
      });

      req.setTimeout(5000, () => {
        stats.timeouts++;
        stats.total++;
        inFlight--;
        req.destroy();
        if (active) sendRequest(userId);
      });

      req.on('error', () => {
        stats.errors++;
        stats.total++;
        inFlight--;
        if (active) sendRequest(userId);
      });

      req.end();
    }

    // Lancer tous les utilisateurs
    for (let i = 0; i < concurrency; i++) {
      for (let p = 0; p < PIPELINE; p++) {
        sendRequest(i);
      }
    }

    setTimeout(() => {
      active = false;
      const elapsed = (Date.now() - stats.startTime) / 1000;
      const lats = stats.latencies.sort((a, b) => a - b);
      const p50  = lats[Math.floor(lats.length * 0.50)] || 0;
      const p97  = lats[Math.floor(lats.length * 0.975)] || 0;
      const p99  = lats[Math.floor(lats.length * 0.99)] || 0;
      const avg  = lats.length ? Math.round(lats.reduce((a,b)=>a+b,0)/lats.length) : 0;
      const max  = lats.length ? lats[lats.length - 1] : 0;
      const rps  = Math.round(stats.total / elapsed);
      const successRate = stats.total ? ((stats.ok / stats.total) * 100).toFixed(1) : '0';

      resolve({ concurrency, elapsed, rps, avg, p50, p97, p99, max, ...stats, successRate });
    }, durationSec * 1000);
  });
}

function printResult(r) {
  const emoji = r.successRate >= 95 ? '✅' : r.successRate >= 50 ? '⚠️' : '🔴';
  console.log(`
┌─────────────────────────────────────────────────────┐
│  ${emoji}  TEST: ${r.concurrency} utilisateurs simultanés
├─────────────────────────────────────────────────────┤
│  Requêtes totales   : ${r.total}
│  ✅ Succès (2xx)    : ${r.ok}  (${r.successRate}%)
│  ❌ Erreurs/non-2xx : ${r.errors}
│  ⏱️  Timeouts        : ${r.timeouts}
│  📈 Débit (req/sec) : ${r.rps}
├─────────────────────────────────────────────────────┤
│  Latence moyenne    : ${r.avg} ms
│  Latence p50        : ${r.p50} ms
│  Latence p97.5      : ${r.p97} ms
│  Latence p99        : ${r.p99} ms
│  Latence max        : ${r.max} ms
└─────────────────────────────────────────────────────┘`);
}

async function main() {
  const levels = [10, 50, 100, 200, 280, 360];
  const DURATION = 15;

  console.log('╔═════════════════════════════════════════════════════╗');
  console.log('║     TAWJEEH — TEST DE PERFORMANCE EN PRODUCTION     ║');
  console.log(`║     Serveur : ${TARGET_HOST}                    ║`);
  console.log(`║     Endpoint: ${TARGET_PATH}         ║`);
  console.log(`║     Date    : ${new Date().toLocaleString('fr-FR')}          ║`);
  console.log('╚═════════════════════════════════════════════════════╝');

  const summary = [];

  for (const level of levels) {
    process.stdout.write(`\n⏳ Lancement du test à ${level} utilisateurs (${DURATION}s)...`);
    const result = await runTest(level, DURATION);
    printResult(result);
    summary.push(result);
    if (level !== levels[levels.length - 1]) {
      process.stdout.write('\n⏸️  Pause 5s avant le prochain palier...\n');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Tableau récapitulatif
  console.log('\n\n╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        RÉCAPITULATIF FINAL                             ║');
  console.log('╠══════════╦═══════════╦══════════╦══════════╦══════════╦═══════════════╣');
  console.log('║  Users   ║  Req/sec  ║  Lat moy ║  Lat p99 ║ Lat max  ║ Taux succès   ║');
  console.log('╠══════════╬═══════════╬══════════╬══════════╬══════════╬═══════════════╣');
  for (const r of summary) {
    const emoji = r.successRate >= 95 ? '✅' : r.successRate >= 50 ? '⚠️ ' : '🔴';
    console.log(
      `║  ${String(r.concurrency).padEnd(7)} ║  ${String(r.rps).padEnd(8)} ║  ${String(r.avg+'ms').padEnd(7)} ║  ${String(r.p99+'ms').padEnd(7)} ║  ${String(r.max+'ms').padEnd(7)} ║ ${emoji} ${String(r.successRate+'%').padEnd(10)} ║`
    );
  }
  console.log('╚══════════╩═══════════╩══════════╩══════════╩══════════╩═══════════════╝');

  // Diagnostic
  console.log('\n📋 DIAGNOSTIC :');
  const bottleneck = summary.find(r => r.successRate < 95);
  if (bottleneck) {
    console.log(`  ⚠️  Premier point de saturation : ${bottleneck.concurrency} utilisateurs simultanés`);
    console.log(`     (taux de succès tombé à ${bottleneck.successRate}%)`);
  } else {
    console.log('  ✅ Serveur stable sur tous les paliers testés.');
  }
  const latencyWarn = summary.find(r => r.p99 > 1000);
  if (latencyWarn) {
    console.log(`  ⚠️  Latence p99 > 1s détectée à partir de ${latencyWarn.concurrency} utilisateurs (${latencyWarn.p99}ms)`);
  }
}

main().catch(console.error);
