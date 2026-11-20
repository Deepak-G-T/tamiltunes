import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { UPDATE_REPO, UPDATE_HOSTS, AUTO_CHECK_MS, versionJsonUrl, apkUrl, isAllowedStartUrl, isAllowedHop, compareVersionCode, versionCodeFromTag, parseVersionInfo, updateErrorMessage, shouldAutoCheck, describeLastChecked, formatBytes } from './appUpdate';

const OK = { versionName: '1.0.1', versionCode: 10001, sha256: 'a'.repeat(64), size: 8800000, changelog: ['Fix one', 'Fix two'] };

describe('version comparison', () => {
  it('newer, equal, older', () => {
    expect(compareVersionCode(4, 10001)).toBe(1);
    expect(compareVersionCode(10001, 10001)).toBe(0);
    expect(compareVersionCode(10002, 10001)).toBe(-1);
  });
  it('garbage never offers an update', () => {
    for (const bad of [[null, 5], [5, undefined], ['x', 5], [5, 'y'], [-1, 5], [1.5, 5], [5, NaN]]) expect(compareVersionCode(...bad)).toBe(0);
  });
  it('versionCode from a tag grows with the version and starts above debug run numbers', () => {
    expect(versionCodeFromTag('v1.0.1')).toBe(10001);
    expect(versionCodeFromTag('1.2.3')).toBe(10203);
    expect(versionCodeFromTag('v2.0.0')).toBe(20000);
    expect(versionCodeFromTag('v1.0.1')).toBeGreaterThan(9999);
    expect(versionCodeFromTag('v1.0.10')).toBeGreaterThan(versionCodeFromTag('v1.0.9'));
    for (const bad of ['v1.0', 'latest', 'v1.0.100', 'v1.100.0', '', null, 'v1.0.1-beta']) expect(versionCodeFromTag(bad)).toBeNull();
  });
});

describe('URL allow-list', () => {
  it('starts only inside this repository releases, over https on github.com', () => {
    expect(isAllowedStartUrl(versionJsonUrl())).toBe(true);
    expect(isAllowedStartUrl(apkUrl())).toBe(true);
    expect(isAllowedStartUrl(`https://github.com/${UPDATE_REPO}/releases/download/v1.0.1/app-release.apk`)).toBe(true);
  });
  it('rejects every other address', () => {
    for (const bad of [
      'http://github.com/Deepak-G-T/tamiltunes/releases/latest/download/version.json',
      'https://github.com/other/repo/releases/latest/download/version.json',
      `https://github.com/${UPDATE_REPO}/issues/1`,
      `https://github.com/${UPDATE_REPO}-evil/releases/latest/download/x.apk`,
      `https://evil.example/${UPDATE_REPO}/releases/latest/download/x.apk`,
      `https://github.com.evil.example/${UPDATE_REPO}/releases/x`,
      `https://user:pw@github.com/${UPDATE_REPO}/releases/x`,
      `https://github.com:8443/${UPDATE_REPO}/releases/x`,
      'https://api.github.com/repos/Deepak-G-T/tamiltunes/releases/latest',
      'file:///sdcard/a.apk', 'javascript:alert(1)', '', null, undefined, 'not a url',
    ]) expect(isAllowedStartUrl(bad)).toBe(false);
  });
  it('redirect hops: https on the known hosts only', () => {
    for (const h of UPDATE_HOSTS) expect(isAllowedHop(`https://${h}/x`)).toBe(true);
    for (const bad of ['http://github.com/x', 'https://evil.example/x', 'https://objects.githubusercontent.com.evil.example/x', 'https://raw.githubusercontent.com/x', 'https://github.com:444/x', 'https://u@github.com/x', 'ftp://github.com/x', null]) expect(isAllowedHop(bad)).toBe(false);
  });
  it('the Java plugin repeats the same repository and host list', () => {
    const java = fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/java/com/tamiltunes/app/AppUpdaterPlugin.java'), 'utf8');
    expect(java).toContain(`REPO = "${UPDATE_REPO}"`);
    const hosts = [...java.matchAll(/HOSTS = \{([^}]*)\}/g)][0][1].split(',').map((s) => s.trim().replaceAll('"', '')).filter(Boolean);
    expect(hosts).toEqual(UPDATE_HOSTS);
  });
});

describe('version.json validation', () => {
  it('accepts a good file (object or text)', () => {
    expect(parseVersionInfo(OK)).toEqual({ ok: true, info: { versionName: '1.0.1', versionCode: 10001, sha256: 'a'.repeat(64), size: 8800000, changelog: ['Fix one', 'Fix two'] } });
    expect(parseVersionInfo(JSON.stringify(OK)).ok).toBe(true);
  });
  it('a changelog may be one text with lines; long ones are cut', () => {
    const r = parseVersionInfo({ ...OK, changelog: `a\n\n b \n${'x'.repeat(500)}` });
    expect(r.info.changelog.slice(0, 2)).toEqual(['a', 'b']);
    expect(r.info.changelog[2].length).toBe(200);
  });
  it('rejects bad files', () => {
    expect(parseVersionInfo('{oops').reason).toBe('bad_json');
    expect(parseVersionInfo(null).reason).toBe('bad_json');
    expect(parseVersionInfo({ ...OK, versionCode: 0 }).reason).toBe('bad_version_code');
    expect(parseVersionInfo({ ...OK, versionCode: 'abc' }).reason).toBe('bad_version_code');
    expect(parseVersionInfo({ ...OK, versionName: '1.0' }).reason).toBe('bad_version_name');
    expect(parseVersionInfo({ ...OK, sha256: 'xyz' }).reason).toBe('bad_hash');
    expect(parseVersionInfo({ ...OK, sha256: 'a'.repeat(63) }).reason).toBe('bad_hash');
    expect(parseVersionInfo({ ...OK, size: -1 }).reason).toBe('bad_size');
    expect(parseVersionInfo({ ...OK, size: 9e12 }).reason).toBe('bad_size');
  });
  it('upper-case hashes are normalised', () => {
    expect(parseVersionInfo({ ...OK, sha256: 'A'.repeat(64) }).info.sha256).toBe('a'.repeat(64));
  });
});

describe('error messages (hash mismatch, rate limit and the rest)', () => {
  it('every Java error code has its own plain message', () => {
    const codes = ['offline', 'rate_limited', 'no_release', 'low_storage', 'hash_mismatch', 'not_allowed', 'cancelled', 'need_permission', 'bad_json'];
    const msgs = codes.map(updateErrorMessage);
    expect(new Set(msgs.slice(0, 8)).size).toBe(8);
    expect(updateErrorMessage('hash_mismatch')).toMatch(/deleted/);
    expect(updateErrorMessage('rate_limited')).toMatch(/busy/);
    expect(updateErrorMessage('???')).toMatch(/could not be completed/);
  });
  it('the Java plugin only uses codes the app knows', () => {
    const java = fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/java/com/tamiltunes/app/AppUpdaterPlugin.java'), 'utf8');
    const used = new Set([...java.matchAll(/(?:UpdateException|reject)\("([a-z_]+)"/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThanOrEqual(8);
    for (const c of used) if (c !== 'failed') expect(updateErrorMessage(c), `code ${c}`).not.toMatch(/could not be completed/);
  });
});

describe('quiet automatic check', () => {
  const now = 1_000_000_000_000;
  it('only in the app, only after 12 hours, never while music plays', () => {
    expect(shouldAutoCheck({ native: false, lastChecked: 0, now, isPlaying: false })).toBe(false);
    expect(shouldAutoCheck({ native: true, lastChecked: 0, now, isPlaying: false })).toBe(true);
    expect(shouldAutoCheck({ native: true, lastChecked: 0, now, isPlaying: true })).toBe(false);
    expect(shouldAutoCheck({ native: true, lastChecked: now - AUTO_CHECK_MS + 1000, now, isPlaying: false })).toBe(false);
    expect(shouldAutoCheck({ native: true, lastChecked: now - AUTO_CHECK_MS, now, isPlaying: false })).toBe(true);
    expect(shouldAutoCheck({ native: true, lastChecked: now + 5000, now, isPlaying: false })).toBe(true); // a clock set back must not block checks for ever
  });
});

describe('text helpers', () => {
  it('last checked', () => {
    const now = 1_700_000_000_000;
    expect(describeLastChecked(0, now)).toBe('Never checked');
    expect(describeLastChecked(now - 10_000, now)).toBe('Last checked just now');
    expect(describeLastChecked(now - 5 * 60_000, now)).toBe('Last checked 5 min ago');
    expect(describeLastChecked(now - 3 * 3600_000, now)).toBe('Last checked 3 h ago');
  });
  it('sizes', () => { expect(formatBytes(8_800_000)).toBe('8.4 MB'); expect(formatBytes(2048)).toBe('2 KB'); expect(formatBytes(12)).toBe('12 B'); });
});
