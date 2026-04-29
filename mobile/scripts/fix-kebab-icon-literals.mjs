// Replaces 'kebab-glyph' string literals with 'camelKey' wherever the kebab is a known Ionicons glyph (from map.ionicons.auto.ts).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');
const glyphJson = require(
  '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
);
const VALID = new Set(Object.keys(glyphJson));

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.isFile() && (p.endsWith('.tsx') || p.endsWith('.ts'))) acc.push(p);
  }
  return acc;
}

function kebabToCamel(s) {
  return s.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

const mapTxt = fs.readFileSync(path.join(srcRoot, 'icons', 'map.ionicons.auto.ts'), 'utf8');
const glyphToCamel = new Map();
for (const m of mapTxt.matchAll(/^\s*(\w+):\s*'([a-z0-9-]+)',?\s*$/gm)) {
  glyphToCamel.set(m[2], m[1]);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const file of walk(srcRoot)) {
  if (file.includes(`${path.sep}icons${path.sep}map.ionicons.auto.ts`)) continue;
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  const byLen = [...glyphToCamel.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [glyph, camel] of byLen) {
    if (!VALID.has(glyph)) continue;
    const g = escapeRe(glyph);
    s = s.replace(new RegExp(`'${g}'`, 'g'), `'${camel}'`);
    s = s.replace(new RegExp(`"${g}"`, 'g'), `'${camel}'`);
  }
  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log(file);
  }
}
