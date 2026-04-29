import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLanIPv4() {
  const nets = os.networkInterfaces();
  const preferredIfaces = ['en0', 'en1', 'wl0', 'wlan0', 'eth0'];

  for (const name of preferredIfaces) {
    const addrs = nets[name] ?? [];
    for (const addr of addrs) {
      if (addr && addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }

  for (const addrs of Object.values(nets)) {
    for (const addr of addrs ?? []) {
      if (addr && addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function newestFile(paths) {
  let best = null;
  for (const p of paths) {
    if (!exists(p)) continue;
    const stat = fs.statSync(p);
    if (!stat.isFile()) continue;
    if (!best || stat.mtimeMs > best.mtimeMs) best = { p, mtimeMs: stat.mtimeMs };
  }
  return best?.p ?? null;
}

function guessApkPath() {
  // default Gradle output (what you built today)
  const releaseApk = path.resolve(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const debugApk = path.resolve(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const candidates = [releaseApk, debugApk];
  return newestFile(candidates);
}

const apkPathArg = process.argv.find((a) => a.startsWith('--apk='));
const portArg = process.argv.find((a) => a.startsWith('--port='));

const apkPath = apkPathArg ? path.resolve(process.cwd(), apkPathArg.slice('--apk='.length)) : guessApkPath();
if (!apkPath) {
  console.error('APK introuvable. Build d’abord avec Gradle: cd android && ./gradlew :app:assembleRelease');
  process.exit(1);
}

const outDir = path.resolve(__dirname, '..', 'dist', 'apk');
fs.mkdirSync(outDir, { recursive: true });

const destApk = path.join(outDir, 'studara.apk');
fs.copyFileSync(apkPath, destApk);

const ip = getLanIPv4();
const port = portArg ? Number(portArg.slice('--port='.length)) : 8088;

const indexHtml = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Studara APK</title>
    <style>
      body { font-family: -apple-system, system-ui, Segoe UI, Roboto, Arial; padding: 24px; }
      .card { max-width: 520px; border: 1px solid #ddd; border-radius: 12px; padding: 16px; }
      a { display: inline-block; margin-top: 10px; }
      code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div><strong>Studara APK</strong></div>
      <div>Fichier: <code>studara.apk</code></div>
      <a href="/studara.apk">Télécharger l’APK</a>
      <div style="margin-top: 10px; font-size: 12px; color: #666;">
        Si Android bloque l’installation, active “Installer des applis inconnues” pour ton navigateur/fichiers.
      </div>
    </div>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  if (!req.url || req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexHtml);
    return;
  }

  if (req.url === '/studara.apk') {
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': 'attachment; filename="studara.apk"',
    });
    fs.createReadStream(destApk).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`APK source: ${apkPath}`);
  console.log(`APK copy:   ${destApk}`);
  console.log(`\nOuvre sur ton Android (même Wi‑Fi): http://${ip}:${port}\n`);
});

