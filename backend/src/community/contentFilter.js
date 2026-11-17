/**
 * Profanity + spam filter for comments and bios.
 * The word lists live in contentFilterWords.js so they can be reviewed and
 * edited without touching logic. No per-song rules here.
 */
import { ENGLISH_BLOCKLIST, TAMIL_BLOCKLIST, TAMIL_ROMANIZED_BLOCKLIST } from './contentFilterWords.js';

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

const fold = (s) =>
  s.normalize('NFC').toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c] ?? c);

// Collapse repeats ("fuuuck" -> "fuck") and strip separators inside words ("f.u.c.k").
const unsep = (s) => s.replace(/(?<=\p{L})[.\-_*](?=\p{L})/gu, '');
const squash = (s) => unsep(s).replace(/(.)\1{2,}/g, '$1$1'); // "fuuuck" -> "fuuck" (keeps legit doubles)
const squash1 = (s) => unsep(s).replace(/(.)\1{2,}/g, '$1'); // "fuuuck" -> "fuck"

const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildMatcher(words, { wordBoundary }) {
  if (!words.length) return null;
  const src = words.map((w) => escapeRe(w.toLowerCase())).join('|');
  return wordBoundary
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, 'iu')
    : new RegExp(`(?:${src})`, 'iu');
}

const latin = buildMatcher([...ENGLISH_BLOCKLIST, ...TAMIL_ROMANIZED_BLOCKLIST], { wordBoundary: true });
// Tamil script has combining marks, so use substring matching on the exact lemma.
const tamil = buildMatcher(TAMIL_BLOCKLIST, { wordBoundary: false });

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|in|io|xyz|ru|cn|tk|ly|me|co|app|link)\b)/i;
const CONTACT_RE = /(\b\d{10}\b|\+\d{8,}|@[a-z0-9_.]{3,}|t\.me\/|wa\.me\/)/i;
const SPAM_PHRASES = /(subscribe to my|sub4sub|follow me|click here|free money|whatsapp me|dm me)/i;

/**
 * @param {string} text already sanitised
 * @returns {{ ok: boolean, reason?: 'profanity'|'spam', detail?: string }}
 */
export function checkContent(text) {
  if (!text) return { ok: true };
  const lowered = fold(text);
  const variants = [squash(lowered), squash1(lowered), squash(text.toLowerCase())];
  if ((latin && variants.some((v) => latin.test(v))) || (tamil && tamil.test(text.normalize('NFC')))) {
    return { ok: false, reason: 'profanity' };
  }
  if (URL_RE.test(text)) return { ok: false, reason: 'spam', detail: 'links' };
  if (CONTACT_RE.test(text)) return { ok: false, reason: 'spam', detail: 'contact' };
  if (SPAM_PHRASES.test(text)) return { ok: false, reason: 'spam', detail: 'promo' };
  if (/(.)\1{9,}/u.test(text)) return { ok: false, reason: 'spam', detail: 'repeated characters' };
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 6 && new Set(words).size / words.length < 0.34) {
    return { ok: false, reason: 'spam', detail: 'repeated words' };
  }
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 20 && letters === letters.toUpperCase()) {
    return { ok: false, reason: 'spam', detail: 'all caps' };
  }
  return { ok: true };
}

export const FILTER_MESSAGES = {
  profanity: 'Please keep it respectful: that comment contains language we do not allow.',
  spam: 'That looks like spam (links, promotions or repeated text). Please rephrase.',
};
