const path = require('path');
const fs = require('fs');

/** Parse minimal KEY=value depuis deploy/api.env (sans dépendre du merge dotenv + PM2). */
function parseDotEnvFileSync(absPath) {
  const out = {};
  if (!fs.existsSync(absPath)) return out;
  const text = fs.readFileSync(absPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (!key) continue;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const deployEnvPath = path.join(__dirname, 'api.env');
const fileEnv = parseDotEnvFileSync(deployEnvPath);

/**
 * PM2 : charger deploy/api.env dans process.env (shell qui lance pm2).
 * Les clés API sont aussi fusionnées explicitement plus bas pour éviter GROQ="".
 */
(function loadDeployApiEnv() {
  if (!fs.existsSync(deployEnvPath)) return;
  try {
    const dotenv = require(path.join(__dirname, '..', 'api', 'node_modules', 'dotenv'));
    dotenv.config({ path: deployEnvPath });
  } catch (e) {
    console.warn('[ecosystem] Impossible de charger deploy/api.env :', e.message);
  }
})();

function pickEnv(name) {
  const shell = process.env[name];
  const file = fileEnv[name];
  const v = (shell && String(shell).trim() !== '' ? shell : file) || '';
  return String(v).trim();
}

const openai = pickEnv('OPENAI_API_KEY');
const google = pickEnv('GOOGLE_API_KEY');
const groq = pickEnv('GROQ_API_KEY');
const whisperGroq = pickEnv('WHISPER_GROQ_API_KEY');
const summaryAiGroq = pickEnv('SUMMARY_AI_GROQ_API_KEY');

/** Ne jamais passer *_API_KEY="" aux workers : ça casse dotenv sur api/.env */
const apiKeysEnv = {
  ...(openai ? { OPENAI_API_KEY: openai } : {}),
  ...(google ? { GOOGLE_API_KEY: google } : {}),
  ...(groq ? { GROQ_API_KEY: groq } : {}),
  ...(whisperGroq ? { WHISPER_GROQ_API_KEY: whisperGroq } : {}),
  ...(summaryAiGroq ? { SUMMARY_AI_GROQ_API_KEY: summaryAiGroq } : {}),
};

module.exports = {
  apps: [{
    name: 'studara-api',
    script: 'dist/index.js',
    cwd: '/var/www/studara/api',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      // Redis local — partagé entre tous les workers (cache cohérent)
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      ...apiKeysEnv,
    },
    // ── Cluster mode ────────────────────────────────────────────────────────
    // 'max' = un worker par cœur CPU disponible.
    // Le cache Redis est partagé → cohérence garantie entre workers.
    // PRÉREQUIS : redis-server doit tourner sur le VPS avant pm2 start.
    instances:   'max',
    exec_mode:   'cluster',
    autorestart: true,
    watch: false,
    // Restart si un worker dépasse 500 Mo (sécurité contre les fuites mémoire)
    max_memory_restart: '500M',
    error_file: '/var/log/studara/api-error.log',
    out_file:   '/var/log/studara/api-out.log',
    // Graceful reload : laisser les requêtes en cours se terminer
    kill_timeout:  5000,
    listen_timeout: 8000,
  }]
};
