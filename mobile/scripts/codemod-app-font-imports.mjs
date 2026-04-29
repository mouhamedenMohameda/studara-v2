/**
 * One-off style codemod: move Text / TextInput from react-native to @/ui/*.
 * Safe to re-run: skips files that already import from @/ui/Text.
 *
 * If a file’s first `import` is multiline (e.g. `import React, {` … `} from 'react'`),
 * insert new lines manually after the full React import — do not insert after the
 * opening line only.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');

const SKIP = new Set([
  path.join(root, 'src/ui/Text.tsx'),
  path.join(root, 'src/ui/TextInput.tsx'),
]);

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.isFile() && (p.endsWith('.tsx') || p.endsWith('.ts'))) acc.push(p);
  }
  return acc;
}

function splitSpecifiers(inner) {
  const body = inner.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
  if (!body) return [];
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '<' || ch === '{' || ch === '(') depth++;
    else if (ch === '>' || ch === '}' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function firstImportSpecifierName(spec) {
  const s = spec.trim();
  if (s.startsWith('type ')) return null;
  const m = s.match(/^(\w+)/);
  return m?.[1] ?? null;
}

function processFile(filePath) {
  if (SKIP.has(filePath)) return false;
  let s = fs.readFileSync(filePath, 'utf8');
  if (s.includes("@/ui/Text") || s.includes("@/ui/TextInput")) return false;

  const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*['"]react-native['"]\s*;/g;
  let tookText = false;
  let tookTextInput = false;

  s = s.replace(importRe, (full, innerRaw) => {
    const inner = `{${innerRaw}}`;
    const specs = splitSpecifiers(inner);
    const kept = [];
    let localChanged = false;
    for (const spec of specs) {
      const name = firstImportSpecifierName(spec);
      if (name === 'Text') {
        tookText = true;
        localChanged = true;
        continue;
      }
      if (name === 'TextInput') {
        tookTextInput = true;
        localChanged = true;
        continue;
      }
      kept.push(spec);
    }
    if (!localChanged) return full;
    if (kept.length === 0) return '';
    return `import { ${kept.join(', ')} } from 'react-native';`;
  });

  if (!tookText && !tookTextInput) return false;

  s = s.replace(/\n{3,}/g, '\n\n');
  const linesToAdd = [];
  if (tookText) linesToAdd.push(`import { Text } from '@/ui/Text';`);
  if (tookTextInput) linesToAdd.push(`import { TextInput } from '@/ui/TextInput';`);

  const m = s.match(/^import\s/m);
  if (!m) return false;
  const insertAt = s.indexOf('\n', m.index) + 1;
  s = s.slice(0, insertAt) + linesToAdd.join('\n') + '\n' + s.slice(insertAt);

  fs.writeFileSync(filePath, s);
  return true;
}

let n = 0;
for (const f of walk(srcDir)) {
  if (processFile(f)) {
    console.log(f);
    n++;
  }
}
console.log(`Updated ${n} files.`);
