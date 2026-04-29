// Replaces Ionicons with AppIcon and kebab-case name="..." with camelCase AppIconName.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.isFile() && p.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

function kebabToCamel(s) {
  return s.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

function stripIoniconsFromReactNativeImport(block) {
  const inner = block.match(/\{([\s\S]*)\}\s*from\s*['"]react-native['"]/)?.[1];
  if (!inner) return null;
  const parts = inner.split(',').map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p) => !/^Ionicons\b/.test(p.split(/\s+as\s+/)[0].trim()));
  if (kept.length === parts.length) return null;
  if (kept.length === 0) return '';
  return `import { ${kept.join(', ')} } from 'react-native';`;
}

function processFile(filePath) {
  if (filePath.includes(`${path.sep}icons${path.sep}`)) return false;
  let s = fs.readFileSync(filePath, 'utf8');
  if (!s.includes('Ionicons') && !s.includes('@expo/vector-icons')) return false;

  const orig = s;

  s = s.replace(/<Ionicons\b/g, '<AppIcon');

  s = s.replace(/<AppIcon\s+([^>]*?)name="([a-z0-9-]+)"/g, (_m, rest, kebab) => {
    const camel = kebabToCamel(kebab);
    return `<AppIcon ${rest}name="${camel}"`;
  });

  s = s.replace(/<AppIcon\s+([^>]*?)name='([a-z0-9-]+)'/g, (_m, rest, kebab) => {
    const camel = kebabToCamel(kebab);
    return `<AppIcon ${rest}name='${camel}'`;
  });

  s = s.replace(/import\s*\{[^}]*\bIonicons\b[^}]*\}\s*from\s*['"]@expo\/vector-icons['"]\s*;/g, (block) => {
    const inner = block.match(/\{([\s\S]*?)\}\s*from/)?.[1];
    if (!inner) return block;
    const parts = inner.split(',').map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((p) => {
      const base = p.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      return base !== 'Ionicons';
    });
    if (kept.length === 0) return '';
    return `import { ${kept.join(', ')} } from '@expo/vector-icons';`;
  });

  s = s.replace(/\n{3,}/g, '\n\n');

  if (!s.includes("from '@/icons'") && s.includes('<AppIcon')) {
    const firstImport = s.search(/^import\s/m);
    if (firstImport >= 0) {
      const insertAt = s.indexOf('\n', firstImport) + 1;
      s = s.slice(0, insertAt) + "import { AppIcon } from '@/icons';\n" + s.slice(insertAt);
    }
  }

  s = s.replace(/\bkeyof typeof Ionicons\.glyphMap\b/g, 'AppIconName');

  const rnImport = s.match(/import\s*\{[^}]+\}\s*from\s*['"]react-native['"]\s*;/);
  if (rnImport && rnImport[0].includes('Ionicons')) {
    const next = stripIoniconsFromReactNativeImport(rnImport[0]);
    if (next !== null) {
      s = s.replace(rnImport[0], next === '' ? '' : next);
    }
  }

  if (s.includes('AppIconName') && !s.includes("from '@/icons'")) {
    const firstImport = s.search(/^import\s/m);
    if (firstImport >= 0) {
      const insertAt = s.indexOf('\n', firstImport) + 1;
      s = s.slice(0, insertAt) + "import { type AppIconName } from '@/icons';\n" + s.slice(insertAt);
    }
  } else if (s.includes('AppIconName') && s.includes("from '@/icons'") && !s.includes('type AppIconName')) {
    s = s.replace(
      /import \{ AppIcon \} from '@\/icons';/,
      "import { AppIcon, type AppIconName } from '@/icons';",
    );
  }

  if (s === orig) return false;
  fs.writeFileSync(filePath, s);
  return true;
}

let n = 0;
for (const f of walk(srcRoot)) {
  if (processFile(f)) {
    console.log(f);
    n++;
  }
}
console.log('Updated', n, 'files');
