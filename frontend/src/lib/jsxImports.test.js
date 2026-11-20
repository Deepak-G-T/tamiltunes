import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A component used in JSX but never imported only crashes when that line renders. An icon shown to admins only crashed the whole page for the admin and
// for nobody else (ShieldAlert in Sidebar.jsx). This reads every .jsx file and fails when a capitalised JSX tag is neither imported nor declared in the file.
const root = path.resolve(__dirname, '..');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (p.endsWith('.jsx')) out.push(p); } return out; };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('JSX components are imported', () => {
  it('every capitalised JSX tag is imported or declared in its own file', () => {
    const missing = [];
    for (const f of walk(root)) {
      const s = stripComments(fs.readFileSync(f, 'utf8'));
      const tags = new Set([...s.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1]));
      for (const t of tags) {
        const declared = new RegExp(`(import[^;]*\\b${t}\\b[^;]*from)|(\\b(const|let|var|function|class)\\s+${t}\\b)|(:\\s*${t}\\b)|(\\b${t}\\s*=)|([{,]\\s*${t}\\s*[,}])`, 'm'); // also `({ to, Icon }) =>` (a component passed in as a prop)
        if (!declared.test(s)) missing.push(`${path.relative(root, f).replaceAll('\\', '/')}: <${t}>`);
      }
    }
    expect(missing).toEqual([]);
  });
  it('the guard really catches the Sidebar bug (a tag with no import is reported)', () => {
    const src = "import { A } from 'x';\nconst X = () => <div><A /><ShieldAlert /></div>;";
    const tags = [...src.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1]);
    const declared = (t) => new RegExp(`(import[^;]*\\b${t}\\b[^;]*from)|(\\b(const|let|var|function|class)\\s+${t}\\b)`).test(src);
    expect(tags.filter((t) => !declared(t))).toEqual(['ShieldAlert']);
  });
});
