// Builds the web app, copies it into the Android project and runs a Gradle task. Works on Windows, macOS and Linux.
// Usage (from the frontend folder):   node scripts/android-build.mjs assembleDebug        -> android/app/build/outputs/apk/debug/app-debug.apk
//                                     node scripts/android-build.mjs bundleRelease       -> a signed .aab (needs the signing variables, see docs/ANDROID_APP.md)
// Needs: JDK 21 and the Android SDK (ANDROID_HOME, or android/local.properties with sdk.dir=...).
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const task = process.argv[2] || 'assembleDebug';
const win = process.platform === 'win32';
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win });
  if (r.status !== 0) { console.error(`\nFailed: ${cmd} ${args.join(' ')}`); process.exit(r.status || 1); }
};
const npx = win ? 'npx.cmd' : 'npx';
run(npx, ['vite', 'build'], process.cwd());
run(npx, ['cap', 'sync', 'android'], process.cwd());
const version = process.env.TAMILTUNES_VERSION_NAME ? [`-PtamiltunesVersionName=${process.env.TAMILTUNES_VERSION_NAME}`] : [];
const code = process.env.TAMILTUNES_VERSION_CODE ? [`-PtamiltunesVersionCode=${process.env.TAMILTUNES_VERSION_CODE}`] : [];
run(win ? 'gradlew.bat' : './gradlew', [task, ...version, ...code], path.resolve('android'));
