import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', 'src');

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.jsx')) out.push(p);
  }
  return out;
};

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const files = walk(root);
const missing = [];

for (const f of files) {
  const s = stripComments(fs.readFileSync(f, 'utf8'));
  const tags = new Set([...s.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1]));
  for (const t of tags) {
    const declared = new RegExp(
      `(import[^;]*\\b${t}\\b[^;]*from)|(\\b(const|let|var|function|class)\\s+${t}\\b)|(:\\s*${t}\\b)|(\\b${t}\\s*=)|([{,]\\s*${t}\\s*[,}])`,
      'm'
    );
    if (!declared.test(s)) {
      missing.push(`${path.relative(root, f).replaceAll('\\', '/')}: <${t}>`);
    }
  }
}

if (missing.length > 0) {
  console.error('\n❌ BUILD FAILED: Missing JSX component or icon imports detected:');
  for (const m of missing) console.error(`  - ${m}`);
  console.error('\nPlease import all referenced components/icons before building.\n');
  process.exit(1);
} else {
  console.log(`✅ All JSX components and icons are properly imported across ${files.length} JSX files.`);
}
