/**
 * Text sanitisation for user-generated content.
 * React escapes on render; this is defence in depth so stored text never
 * contains markup, control characters or invisible direction overrides.
 */

// C0/C1 controls (keeping \n), zero-width + bidi overrides (keep ZWJ/ZWNJ: Tamil/emoji need them).
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​‎‏‪-‮⁦-⁩﻿]/g;
const TAGS = /<[^>]*>?/g;

/**
 * @param {unknown} input
 * @param {{ multiline?: boolean }} [opts]
 * @returns {string}
 */
export function sanitizeText(input, { multiline = true } = {}) {
  if (typeof input !== 'string') return '';
  let s = input.normalize('NFC').replace(CONTROL, '').replace(TAGS, '');
  s = s.replace(/\r\n?/g, '\n');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

/** Length in user-perceived characters (emoji / Tamil clusters count once). */
export function charLength(s) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) n++;
    return n;
  }
  return [...s].length;
}

/** Parse "1:23" / "01:02:03" / seconds into integer seconds, or null. */
export function parseTimestamp(text) {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)$/.exec(String(text).trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  if (m[1] && min > 59) return null;
  return h * 3600 + min * 60 + Number(m[3]);
}

/** First "m:ss" mention in a comment, if any (used to auto-attach a timestamp). */
export function extractTimestamp(body) {
  const m = /(?<![\d:])(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?![\d:])/.exec(body);
  return m ? parseTimestamp(m[1]) : null;
}
