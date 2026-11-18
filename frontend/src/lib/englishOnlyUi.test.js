import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// The app UI is English only. Tamil may appear in song data and user text at runtime, never as a label in the source.
describe('English-only UI', () => {
  const root = join(process.cwd(), 'src');
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  it('has no Tamil script in components, pages or styles (tests excluded)', () => {
    const offenders = [];
    for (const file of walk(root)) {
      if (!/\.(jsx?|css|html)$/.test(file) || /\.test\.jsx?$/.test(file)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((l, i) => { if (/[஀-௿]/.test(l)) offenders.push(`${relative(root, file)}:${i + 1}`); });
    }
    expect(offenders, `Tamil label found: ${offenders.join(', ')}`).toEqual([]);
  });
});
