// TamilTunes Wrapped: pure helpers (when it opens, the story slides, the share text, the share-card drawing). No network, no React.
import { SITE_URL } from '../config/app';

/** Wrapped is promoted from 1 December to the end of January (in January it shows last year's). */
export function wrappedWindow(now = new Date()) {
  const month = now.getMonth(); // local time: it is the person's own December
  if (month === 11) return { open: true, year: now.getFullYear() };
  if (month === 0) return { open: true, year: now.getFullYear() - 1 };
  return { open: false, year: now.getFullYear() };
}

/** The phone's offset from UTC in minutes (India = 330), what the server needs to cut the year at local midnight. */
export const tzMinutes = (now = new Date()) => (-now.getTimezoneOffset()) || 0; // "|| 0" turns -0 into 0

export const formatNumber = (n) => new Intl.NumberFormat('en-IN').format(Math.round(Number(n) || 0));
const plural = (n, one, many = `${one}s`) => `${formatNumber(n)} ${Number(n) === 1 ? one : many}`;
const fmtDate = (iso) => { try { return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch { return iso; } };

/**
 * The story, one object per screen: { id, eyebrow, title, big?, lines?, list?: [{ label, sub, value }] }.
 * Not enough listening yet: a single friendly screen with progress, never invented numbers.
 */
export function wrappedSlides(w) {
  if (!w) return [];
  if (!w.ready) {
    return [{ id: 'early', eyebrow: `Your ${w.year}`, title: 'Your Wrapped is still warming up', big: `${w.totals.plays} / ${w.minPlays}`, lines: [`Listen to ${Math.max(0, w.minPlays - w.totals.plays)} more songs and your year in music appears here.`] }];
  }
  const t = w.totals;
  const slides = [
    { id: 'intro', eyebrow: 'TamilTunes Wrapped', title: `Your ${w.year} in music`, lines: ['Tap to see what you played the most.'] },
    { id: 'minutes', eyebrow: 'You listened for', big: formatNumber(t.minutes), title: 'minutes', lines: [`That is ${formatNumber(t.hours)} hours.`, `${plural(t.plays, 'play')} of ${plural(t.distinctSongs, 'different song')} by ${plural(t.distinctArtists, 'artist')}.`] },
  ];
  if (w.topSongs.length) {
    slides.push({ id: 'songs', eyebrow: 'Your top song', title: w.topSongs[0].title, big: `${formatNumber(w.topSongs[0].plays)} plays`, lines: [w.topSongs[0].artist].filter(Boolean),
      list: w.topSongs.slice(1).map((s, i) => ({ label: s.title, sub: s.artist, value: `${formatNumber(s.plays)} plays`, rank: i + 2 })) });
  }
  if (w.topArtists.length) {
    slides.push({ id: 'artists', eyebrow: 'Your top artist', title: w.topArtists[0].name, big: `${formatNumber(w.topArtists[0].minutes)} minutes`,
      list: w.topArtists.slice(1).map((a, i) => ({ label: a.name, value: `${formatNumber(a.plays)} plays`, rank: i + 2 })) });
  }
  if (w.topFilms.length) {
    slides.push({ id: 'films', eyebrow: 'Your top films', title: w.topFilms[0].name, big: `${formatNumber(w.topFilms[0].plays)} plays`,
      lines: w.topComposers.length ? [`Most played music director: ${w.topComposers[0].name}`] : [],
      list: w.topFilms.slice(1).map((f, i) => ({ label: f.name, value: `${formatNumber(f.plays)} plays`, rank: i + 2 })) });
  }
  const when = [];
  if (w.timeOfDay) when.push(`You mostly listened in the ${w.timeOfDay.part}.`);
  if (w.favouriteWeekday) when.push(`${w.favouriteWeekday} was your day.`);
  if (w.busiestDay) when.push(`Your biggest day was ${fmtDate(w.busiestDay.date)}: ${formatNumber(w.busiestDay.minutes)} minutes.`);
  if (t.longestStreak > 1) when.push(`Your longest streak: ${plural(t.longestStreak, 'day')} in a row.`);
  if (w.topEra) when.push(`${w.topEra.share}% of your plays were from the ${w.topEra.label}.`);
  slides.push({ id: 'when', eyebrow: 'Your listening style', title: w.timeOfDay?.label || 'Music lover', lines: when });
  slides.push({ id: 'summary', eyebrow: `${w.year} on TamilTunes`, title: 'Share your year' });
  return slides;
}

export function shareText(w) {
  if (!w?.ready) return `Listening to Tamil songs on TamilTunes. ${SITE_URL}`;
  const bits = [`My ${w.year} on TamilTunes: ${formatNumber(w.totals.minutes)} minutes of music.`];
  if (w.topSongs[0]) bits.push(`Top song: ${w.topSongs[0].title}.`);
  if (w.topArtists[0]) bits.push(`Top artist: ${w.topArtists[0].name}.`);
  return bits.join(' ');
}

// ---------------------------------------------------------------- the share picture (drawn here, nothing is uploaded)

export const CARD = { width: 1080, height: 1920 };

/** Cut text with "..." so it fits `maxWidth` (measured with the canvas's own font). */
export function fitText(ctx, text, maxWidth) {
  let t = String(text ?? '');
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(`${t}...`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

/** Draw the card on a 2D context. Returns the lines of text it drew (for tests). */
export function drawShareCard(ctx, w, { width = CARD.width, height = CARD.height } = {}) {
  const drawn = [];
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#14532d'); g.addColorStop(0.55, '#0b2a18'); g.addColorStop(1, '#09090B');
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const pad = 90; const max = width - pad * 2;
  const text = (value, x, y, size, weight, color) => {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Tamil", sans-serif`;
    ctx.fillStyle = color;
    const out = fitText(ctx, value, max);
    ctx.fillText(out, x, y);
    drawn.push(out);
  };
  text('TamilTunes Wrapped', pad, 190, 54, 700, '#86efac');
  text(String(w.year), pad, 330, 150, 800, '#ffffff');
  text(formatNumber(w.totals.minutes), pad, 640, 230, 800, '#ffffff');
  text('minutes of music', pad, 730, 64, 600, '#d4d4d8');
  let y = 920;
  const block = (label, value, sub) => {
    text(label, pad, y, 40, 600, '#86efac'); y += 82;
    text(value, pad, y, 72, 800, '#ffffff'); y += sub ? 68 : 0;
    if (sub) text(sub, pad, y, 44, 500, '#d4d4d8');
    y += 120;
  };
  if (w.ready && w.topSongs[0]) block('TOP SONG', w.topSongs[0].title, w.topSongs[0].artist);
  if (w.ready && w.topArtists[0]) block('TOP ARTIST', w.topArtists[0].name, `${formatNumber(w.topArtists[0].minutes)} minutes`);
  if (w.ready && w.topFilms[0]) block('TOP FILM', w.topFilms[0].name, null);
  if (w.ready && w.timeOfDay) block('LISTENING STYLE', w.timeOfDay.label, null);
  text('tamiltunes', pad, height - 130, 56, 800, '#ffffff');
  text(String(SITE_URL).replace(/^https?:\/\//, ''), pad, height - 64, 40, 500, '#a1a1aa');
  return drawn;
}

const drawCanvas = (w) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CARD.width; canvas.height = CARD.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawShareCard(ctx, w);
  return canvas;
};

/** The picture as a data URL for the on-screen preview (no object URL, no file: the project keeps storage and downloads out of the app). */
export const cardDataUrl = (w) => drawCanvas(w)?.toDataURL('image/png') ?? null;

/** The picture as a PNG blob, made only at the moment the person taps Share (the system share sheet takes it from there). */
export const cardBlob = (w) => new Promise((resolve) => { const c = drawCanvas(w); if (!c) resolve(null); else c.toBlob((b) => resolve(b), 'image/png'); });
