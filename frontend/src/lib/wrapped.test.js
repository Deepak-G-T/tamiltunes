import { describe, it, expect } from 'vitest';
import { wrappedWindow, wrappedSlides, shareText, drawShareCard, fitText, formatNumber, tzMinutes, CARD } from './wrapped';

const ready = {
  year: 2026, ready: true, minPlays: 20,
  totals: { minutes: 12345, hours: 205.8, plays: 3100, distinctSongs: 800, distinctArtists: 150, activeDays: 280, longestStreak: 41 },
  topSongs: [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, title: `Song ${n}`, artist: `Artist ${n}`, plays: 60 - n })),
  topArtists: [1, 2, 3, 4, 5].map((n) => ({ name: `Singer ${n}`, plays: 300 - n, minutes: 900 - n })),
  topFilms: [1, 2, 3].map((n) => ({ name: `Film ${n}`, plays: 100 - n, minutes: 300 })),
  topComposers: [{ name: 'Anirudh', plays: 400, minutes: 1200 }],
  topEra: { label: '2010s', share: 46 }, busiestDay: { date: '2026-05-11', minutes: 410, plays: 98 }, favouriteWeekday: 'Saturday',
  timeOfDay: { part: 'night', label: 'Night owl' }, firstSong: { title: 'First', artist: 'Someone', date: '2026-01-01' },
};
const early = { year: 2026, ready: false, minPlays: 20, totals: { plays: 7, minutes: 20 }, topSongs: [], topArtists: [], topFilms: [], topComposers: [], topEra: null, busiestDay: null, favouriteWeekday: null, timeOfDay: null, firstSong: null };

describe('Wrapped window', () => {
  it('opens in December and January only (January shows last year)', () => {
    expect(wrappedWindow(new Date(2026, 10, 30))).toEqual({ open: false, year: 2026 });
    expect(wrappedWindow(new Date(2026, 11, 1))).toEqual({ open: true, year: 2026 });
    expect(wrappedWindow(new Date(2026, 11, 31))).toEqual({ open: true, year: 2026 });
    expect(wrappedWindow(new Date(2027, 0, 15))).toEqual({ open: true, year: 2026 });
    expect(wrappedWindow(new Date(2027, 1, 1))).toEqual({ open: false, year: 2027 });
  });
  it('time zone helper is the phone offset (India is +330)', () => {
    expect(tzMinutes({ getTimezoneOffset: () => -330 })).toBe(330);
    expect(tzMinutes({ getTimezoneOffset: () => 0 })).toBe(0);
  });
});

describe('Wrapped story', () => {
  it('tells the year in order and ends on the share screen', () => {
    const slides = wrappedSlides(ready);
    expect(slides.map((s) => s.id)).toEqual(['intro', 'minutes', 'songs', 'artists', 'films', 'when', 'summary']);
    expect(slides[1].big).toBe('12,345');
    expect(slides[2].title).toBe('Song 1');
    expect(slides[2].list).toHaveLength(4);
    expect(slides[2].list[0].rank).toBe(2);
    expect(slides[4].lines[0]).toContain('Anirudh');
    expect(slides[5].title).toBe('Night owl');
    expect(slides[5].lines.join(' ')).toMatch(/Saturday/);
    expect(slides[5].lines.join(' ')).toMatch(/11 May/);
    expect(slides[5].lines.join(' ')).toMatch(/41 days in a row/);
  });
  it('never invents numbers when there is not enough listening', () => {
    const slides = wrappedSlides(early);
    expect(slides).toHaveLength(1);
    expect(slides[0].big).toBe('7 / 20');
    expect(slides[0].lines[0]).toContain('13 more songs');
  });
  it('skips slides that have nothing to say', () => {
    const slides = wrappedSlides({ ...ready, topFilms: [], topComposers: [], timeOfDay: null, busiestDay: null, favouriteWeekday: null, topEra: null, totals: { ...ready.totals, longestStreak: 1 } });
    expect(slides.map((s) => s.id)).not.toContain('films');
    expect(slides.find((s) => s.id === 'when').lines).toEqual([]);
  });
  it('handles nothing and numbers', () => {
    expect(wrappedSlides(null)).toEqual([]);
    expect(formatNumber(1234567)).toBe('12,34,567');
    expect(shareText(early)).toMatch(/TamilTunes/);
    expect(shareText(ready)).toMatch(/12,345 minutes/);
    expect(shareText(ready)).toMatch(/Song 1/);
  });
});

// a fake 2D context: records text, measures 10px per letter
const fakeCtx = () => {
  const calls = { text: [], fills: 0 };
  return {
    calls,
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() { calls.fills += 1; },
    fillText(t) { calls.text.push(t); },
    measureText: (t) => ({ width: String(t).length * 10 }),
    set font(v) { this._font = v; }, set fillStyle(v) { this._fill = v; }, set textAlign(v) {}, set textBaseline(v) {},
  };
};

describe('Wrapped share card', () => {
  it('draws the headline numbers and the top picks, all inside the card', () => {
    const ctx = fakeCtx();
    const drawn = drawShareCard(ctx, ready);
    expect(drawn).toContain('12,345');
    expect(drawn).toContain('Song 1');
    expect(drawn).toContain('Singer 1');
    expect(drawn).toContain('Film 1');
    expect(drawn).toContain('Night owl');
    expect(ctx.calls.fills).toBe(1);
    expect(Math.max(...drawn.map((t) => t.length * 10))).toBeLessThanOrEqual(CARD.width - 180);
  });
  it('cuts a very long title with "..." instead of running off the card', () => {
    const drawn = drawShareCard(fakeCtx(), { ...ready, topSongs: [{ id: 'x', title: 'A'.repeat(200), artist: 'B', plays: 9 }] });
    const long = drawn.find((t) => t.startsWith('AAAA'));
    expect(long.endsWith('...')).toBe(true);
    expect(long.length * 10).toBeLessThanOrEqual(CARD.width - 180);
    expect(fitText({ measureText: (t) => ({ width: t.length * 10 }) }, 'short', 500)).toBe('short');
  });
  it('is honest when there is not enough listening: no names, only the totals', () => {
    const drawn = drawShareCard(fakeCtx(), early);
    expect(drawn.some((t) => /TOP SONG|TOP ARTIST/.test(t))).toBe(false);
  });
});
