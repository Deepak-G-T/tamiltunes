// Runs the UI audits and fails if either fails (so one failing suite cannot hide the other):
//   1. src/test/runPlaywrightAudit.mjs  (fix/youtube-feed: screenshots, mini-player clearance, real YouTube iframe test)
//   2. scripts/ui-audit.mjs             (video toggle at 360x640 / 390x844; stubbed YouTube API)
import { spawnSync } from 'node:child_process';

const suites = [
  ['fix/youtube-feed audit', 'src/test/runPlaywrightAudit.mjs'],
  ['video toggle audit', 'scripts/ui-audit.mjs'],
  ['play queue audit', 'scripts/queue-audit.mjs'],
  ['sign in / sign up audit', 'scripts/auth-audit.mjs'],
  ['recent searches audit', 'scripts/search-audit.mjs'],
  ['home feed audit', 'scripts/home-audit.mjs'],
  ['PWA audit (needs port 5000 free)', 'scripts/pwa-audit.mjs']
];

const failed = [];
for (const [name, file] of suites) {
  console.log(`\n=== ${name} (${file}) ===`);
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(name);
}

console.log(`\n=== UI audit summary: ${suites.length - failed.length}/${suites.length} suites passed${failed.length ? `; FAILED: ${failed.join(', ')}` : ''} ===`);
process.exit(failed.length ? 1 : 0);
