// Release helper (run by .github/workflows/android-release.yml, also usable by hand):
//   node scripts/make-version-json.mjs --tag v1.0.1 --apk path/to/app-release.apk --changelog changelog.txt --out version.json
//   node scripts/make-version-json.mjs --tag v1.0.1 --print-env        (prints VERSION_NAME= and VERSION_CODE= for the workflow)
// version.json is what the app's "Check for updates" button reads: { versionName, versionCode, sha256, size, changelog }.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { versionCodeFromTag, parseVersionInfo } from '../src/lib/appUpdate.js';

export function versionFromTag(tag) {
  const code = versionCodeFromTag(tag);
  if (code === null) throw new Error(`The tag "${tag}" must look like v1.2.3 (numbers only, minor and patch up to 99)`);
  return { versionName: String(tag).trim().replace(/^v/, ''), versionCode: code };
}

export function buildVersionJson({ tag, apk, changelogText = '' }) {
  const { versionName, versionCode } = versionFromTag(tag);
  const changelog = String(changelogText).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12).map((l) => l.slice(0, 200));
  const json = { versionName, versionCode, sha256: createHash('sha256').update(apk).digest('hex'), size: apk.length, changelog };
  const check = parseVersionInfo(json);
  if (!check.ok) throw new Error(`version.json would not pass the app's own check: ${check.reason}`);
  return json;
}

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const tag = arg('tag');
    if (process.argv.includes('--print-env')) {
      const v = versionFromTag(tag);
      console.log(`VERSION_NAME=${v.versionName}\nVERSION_CODE=${v.versionCode}`);
    } else {
      const apk = fs.readFileSync(arg('apk'));
      const changelogText = arg('changelog') && fs.existsSync(arg('changelog')) ? fs.readFileSync(arg('changelog'), 'utf8') : '';
      const out = buildVersionJson({ tag, apk, changelogText });
      fs.writeFileSync(arg('out') || 'version.json', `${JSON.stringify(out, null, 2)}\n`);
      console.log(`version.json: ${out.versionName} (${out.versionCode}), ${out.size} bytes, sha256 ${out.sha256}`);
    }
  } catch (e) {
    console.error(`make-version-json: ${e.message}`);
    process.exit(1);
  }
}
