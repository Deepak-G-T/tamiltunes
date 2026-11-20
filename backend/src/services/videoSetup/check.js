/**
 * Owner check for the YouTube video setup: is the key valid, is the Data API enabled, and which channels are in the allow-list.
 * Pure helpers plus one runner that takes `fetch` as an argument so it can be tested without the network. The key is never printed.
 */
import { parseVideoConfig } from '../../config/env.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const KNOWN_OFFICIAL_VIDEO = 'ZdMZ40GSVmc'; // "Leo - Badass Video" (SonyMusicSouthVEVO): a public video used to test the key (1 quota unit)

/** Remove the key from any text before it is shown. */
export const redactKey = (text, key) => {
  let out = String(text ?? '');
  if (key) out = out.split(key).join('[key]');
  return out.replace(/([?&]key=)[^&\s"']+/gi, '$1[key]');
};

/** What a Google error means, in plain words, and what to do. */
export function explainError(status, body = {}) {
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || '';
  const message = String(body?.error?.message || '').slice(0, 200);
  if (status === 400 && /keyInvalid|API_KEY_INVALID|badRequest/i.test(reason + message)) return { code: 'key-invalid', text: 'Google says the key is not valid. Check you copied all of it (no spaces) into YOUTUBE_API_KEY.' };
  if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(reason + message)) return { code: 'api-not-enabled', text: 'The YouTube Data API v3 is not enabled for this key\'s project. In Google Cloud Console open APIs & Services > Library, search "YouTube Data API v3" and press Enable.' };
  if (status === 403 && /quotaExceeded|rateLimitExceeded|dailyLimitExceeded/i.test(reason)) return { code: 'quota', text: 'The daily quota is used up. It resets at midnight Pacific time. Lower VIDEO_INDEX_MAX_PAGES or YOUTUBE_DAILY_BUDGET.' };
  if (status === 403 && /ipRefererBlocked|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|referer|IP address/i.test(reason + message)) return { code: 'restricted', text: 'The key has an application restriction (website or IP address) that blocks this call. For use from Render set "Application restrictions" to None and keep only the "API restrictions: YouTube Data API v3" limit.' };
  if (status === 403 && /API_KEY_SERVICE_BLOCKED|blocked/i.test(reason + message)) return { code: 'api-restricted', text: 'The key\'s API restriction does not include the YouTube Data API v3. Add it under "API restrictions".' };
  if (status === 429) return { code: 'rate', text: 'Google is rate limiting. Wait a minute and run the check again.' };
  return { code: 'other', text: `Unexpected answer from Google (HTTP ${status}${reason ? `, ${reason}` : ''}).` };
}

/** Quota units the daily upload index will use: per channel, each page costs 1 (list) plus 1 (check embeddable). */
export const estimateDailyUnits = ({ channels, pages }) => channels * pages * 2;

export function parseChannelList(text) {
  return String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

const askGoogle = async (fetchFn, path, params, key) => {
  const url = `${API_BASE}/${path}?${new URLSearchParams({ ...params, key })}`;
  try {
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, networkError: redactKey(err?.message, key) };
  }
};

/**
 * @param {{ env?: object, fetchFn?: typeof fetch, channels?: string[] }} [opts]
 * @returns {Promise<{ ok: boolean, lines: string[], units: number }>}  lines = what to show the owner
 */
export async function runCheck({ env = process.env, fetchFn = globalThis.fetch, channels = null } = {}) {
  const cfg = parseVideoConfig(env);
  const key = cfg.youtubeApiKey;
  const ids = channels ?? cfg.videoChannelAllowlist;
  const lines = [];
  let units = 0;
  let ok = true;
  const say = (s) => lines.push(s);

  if (!key) { say('FAIL  YOUTUBE_API_KEY is not set in this shell. Set it for this command only (see docs/VIDEO_SONGS.md); never paste it in chat.'); return { ok: false, lines, units }; }
  say(`OK    a key is set (${key.length} characters; it is never printed)`);
  if (!/^AIza[\w-]{30,}$/.test(key)) say('WARN  the key does not look like a Google API key (they start with "AIza"). Continuing anyway.');

  const bad = ids.filter((id) => !CHANNEL_ID_RE.test(id));
  if (!ids.length) { say('FAIL  VIDEO_CHANNEL_ALLOWLIST is empty: every API result would be rejected (and the API is never called). Add official channel ids.'); ok = false; }
  for (const id of bad) { say(`FAIL  "${id}" is not a channel id (they start with UC and have 24 characters)`); ok = false; }

  // 1. the key + API enabled + embeddable status, with one public video (1 unit)
  const probe = await askGoogle(fetchFn, 'videos', { part: 'status', id: KNOWN_OFFICIAL_VIDEO }, key);
  units += 1;
  if (probe.networkError) { say(`FAIL  could not reach Google: ${probe.networkError}`); return { ok: false, lines, units }; }
  if (!probe.ok) { const e = explainError(probe.status, probe.body); say(`FAIL  ${e.text}`); return { ok: false, lines, units }; }
  const embeddable = probe.body?.items?.[0]?.status?.embeddable;
  say(`OK    the key works and the YouTube Data API v3 is enabled (test video embeddable: ${embeddable === true ? 'yes' : embeddable === false ? 'NO' : 'unknown'})`);

  // 2. the channels: show their real names so the owner can confirm they are official (1 unit for up to 50 channels)
  const valid = ids.filter((id) => CHANNEL_ID_RE.test(id));
  if (valid.length) {
    const res = await askGoogle(fetchFn, 'channels', { part: 'snippet,statistics', id: valid.slice(0, 50).join(','), maxResults: '50' }, key);
    units += 1;
    if (!res.ok) { const e = explainError(res.status, res.body); say(`FAIL  channel lookup: ${e.text}`); ok = false; } else {
      const found = new Map((res.body?.items || []).map((c) => [c.id, c]));
      for (const id of valid) {
        const c = found.get(id);
        if (!c) { say(`FAIL  ${id}: no such channel (check the id on the channel's page)`); ok = false; continue; }
        const videos = c.statistics?.videoCount ?? '?';
        const subs = c.statistics?.hiddenSubscriberCount ? 'hidden' : c.statistics?.subscriberCount ?? '?';
        say(`OK    ${id} = "${c.snippet?.title}"  (${videos} videos, ${subs} subscribers)  <- is this the OFFICIAL channel? open youtube.com/channel/${id}`);
      }
    }
  }

  const perDay = estimateDailyUnits({ channels: valid.length, pages: cfg.videoIndexMaxPages });
  say(`INFO  settings: index ${cfg.videoIndexMaxPages} pages per channel, fallback search ${cfg.videoSearchFallback ? 'on' : 'off'}, daily budget ${cfg.youtubeDailyBudget} units`);
  say(`INFO  the daily index will use about ${perDay} units (${valid.length} channels x ${cfg.videoIndexMaxPages} pages x 2); each fallback search costs about 101; Google's default is 10000 a day`);
  say(`INFO  this check used about ${units} units`);
  return { ok, lines, units };
}
