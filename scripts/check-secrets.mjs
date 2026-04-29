#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

/**
 * Lightweight secret scanner (best-effort).
 * - No dependencies
 * - Intended as a guardrail, not a guarantee
 */

const ROOT = process.cwd();

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.expo',
  '.expo-shared',
  '.next',
  '.claude',
  'ios',
  'android',
  'uploads',
  '.git',
]);

const TEXT_EXT = new Set([
  '.md', '.txt', '.json', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx',
  '.yml', '.yaml', '.env', '.example', '.sh', '.sql',
]);

const PATTERNS = [
  { name: 'OpenAI key', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: 'Google API key', re: /\bAIzaSy[0-9A-Za-z\-_]{20,}\b/g },
  { name: 'Groq key', re: /\bgsk_[0-9A-Za-z]{20,}\b/g },
  { name: 'Postgres URL', re: /\bpostgres(ql)?:\/\/[^\s'")]+/g },
  // Note: will also match in .env.example templates (expected). Review results before acting.
  { name: 'JWT secret assignment', re: /\bJWT_(REFRESH_)?SECRET\s*[:=]\s*.+/gi },
  { name: 'Private key header', re: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
];

function shouldIgnoreDir(name) {
  return IGNORE_DIRS.has(name);
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXT.has(ext);
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.DS_Store')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (shouldIgnoreDir(e.name)) continue;
      walk(p, out);
    } else if (e.isFile()) {
      if (!isTextFile(p)) continue;
      out.push(p);
    }
  }
  return out;
}

function lineNumberAt(text, index) {
  // 1-indexed line numbers
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

const files = walk(ROOT);
let hits = 0;

for (const file of files) {
  let content = '';
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content))) {
      hits++;
      const rel = path.relative(ROOT, file);
      const line = lineNumberAt(content, m.index);
      console.log(`[${name}] ${rel}:${line}`);
    }
  }
}

if (hits > 0) {
  console.error(`\nFound ${hits} potential secret(s). Review and rotate if needed.`);
  process.exit(2);
}

console.log('No obvious secrets found (best-effort).');

