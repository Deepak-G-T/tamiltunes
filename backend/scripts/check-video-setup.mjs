// Owner check for the YouTube video setup. Run it on YOUR computer with the settings in the shell for this command only:
//   YOUTUBE_API_KEY=... VIDEO_CHANNEL_ALLOWLIST=UC...,UC... npm run video:check --prefix backend
// (PowerShell: $env:YOUTUBE_API_KEY="..."; $env:VIDEO_CHANNEL_ALLOWLIST="UC...,UC..."; npm run video:check --prefix backend)
// It costs about 2 quota units, prints the real name of every channel so you can confirm it is official, and never prints the key.
import { runCheck, parseChannelList } from '../src/services/videoSetup/check.js';

const arg = process.argv.find((a) => a.startsWith('--channels='));
const { ok, lines } = await runCheck({ channels: arg ? parseChannelList(arg.slice('--channels='.length)) : null });
for (const l of lines) console.log(l);
console.log(ok ? '\nAll good: set the same values in Render and redeploy.' : '\nFix the lines marked FAIL, then run this again.');
process.exit(ok ? 0 : 1);
