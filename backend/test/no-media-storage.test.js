import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The server never stores audio or video: no file writes anywhere in src, and the stream proxy sets Cache-Control: no-store
// (the pass-through itself is tested in stream.test.js). Fails when someone adds a file write.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};
const FILE_WRITES = /createWriteStream|\bwriteFile(Sync)?\b|\bappendFile(Sync)?\b|fs\.(promises\.)?(write|copy|rename|mkdir|mkdtemp)\w*|\bmkdtemp\b|\btmpdir\b|\bmulter\b/;
const hits = walk(src).filter((f) => FILE_WRITES.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(src, f));
assert.deepEqual(hits, [], `server code must not write files: ${hits.join(', ')}`);

const music = fs.readFileSync(path.join(src, 'controllers/musicController.js'), 'utf8');
assert.match(music, /res\.setHeader\('Cache-Control', 'no-store'\)/, 'the stream proxy forbids storing the audio');
assert.ok(!/for \(const key of \[[^\]]*cache-control/i.test(music), 'the upstream cache headers are not forwarded');
console.log('✓ server: no file writes anywhere in src, and the stream proxy sends Cache-Control: no-store');
process.exit(0);
