import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { versionFromTag, buildVersionJson } from './make-version-json.mjs';
import { parseVersionInfo, compareVersionCode } from '../src/lib/appUpdate.js';

describe('make-version-json', () => {
  it('turns a tag into versionName and versionCode', () => {
    expect(versionFromTag('v1.0.1')).toEqual({ versionName: '1.0.1', versionCode: 10001 });
    expect(versionFromTag('v1.2.3')).toEqual({ versionName: '1.2.3', versionCode: 10203 });
  });
  it('refuses a tag that is not vX.Y.Z', () => {
    for (const t of ['v1.0', 'release', 'v1.0.1-beta', '', undefined]) expect(() => versionFromTag(t)).toThrow(/must look like/);
  });
  it('writes the sha256 and size of the APK and a changelog the app accepts', () => {
    const apk = Buffer.from('pretend apk bytes');
    const j = buildVersionJson({ tag: 'v1.0.1', apk, changelogText: '- Fix one\n\n- Fix two\n' });
    expect(j.sha256).toBe(createHash('sha256').update(apk).digest('hex'));
    expect(j.size).toBe(apk.length);
    expect(j.changelog).toEqual(['- Fix one', '- Fix two']);
    expect(parseVersionInfo(j).ok).toBe(true);
  });
  it('a new tag is newer than the previous one and than any debug build number', () => {
    expect(compareVersionCode(4, versionFromTag('v1.0.0').versionCode)).toBe(1);
    expect(compareVersionCode(versionFromTag('v1.0.9').versionCode, versionFromTag('v1.0.10').versionCode)).toBe(1);
  });
});
