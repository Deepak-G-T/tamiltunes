/**
 * TamilTunes Wrapped: a year in listening for one person. Pure (no database, no clock): the store gives it a year of play events
 * and the songs they point to. A "counted play" is the same rule as Speed Dial: finished, or at least 30 s listened.
 * Same song under another id, spelling or version (unplugged ...) counts as one song (variantKey, like the no-repeat rules).
 */
import { variantKey } from '../related/identity.js';

export const WRAPPED = {
  minPlays: 20,          // below this there is not enough to say anything kind
  topSongs: 5,
  topArtists: 5,
  topFilms: 5,
  topComposers: 3,
  countedSeconds: 30,
  defaultTzMinutes: 330, // India (UTC+5:30): the audience is Tamil; the app sends the phone's own offset
};

const MIN = 60;
const DAY_MS = 86400e3;
const names = (artist) => String(artist || '').split(/\s*(?:,|&| and )\s*/).map((n) => n.trim()).filter(Boolean);
const decadeLabel = (year) => { const d = Math.floor(year / 10) * 10; return d >= 2000 ? `${d}s` : `${String(d).slice(2)}s`; };

export const isCounted = (e) => Boolean(e.completed) || (e.listenedSec ?? 0) >= WRAPPED.countedSeconds;

/** Seconds really listened for one event (a finished song with no listened time counts as its length). Never more than 1.1 x the song. */
export function secondsListened(e, song) {
  const length = e.durationSec || song?.duration || 0;
  const raw = e.listenedSec ?? (e.completed ? length : 0);
  return Math.max(0, length > 0 ? Math.min(raw, Math.round(length * 1.1)) : Math.min(raw, 600));
}

/** The local calendar day (as days since 1970) and hour for a time, in the person's own time zone. */
function localParts(ms, tzMinutes) {
  const local = ms + tzMinutes * 60000;
  return { day: Math.floor(local / DAY_MS), hour: new Date(local).getUTCHours(), weekday: new Date(local).getUTCDay() };
}

const dayLabel = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Longest run of consecutive days with a play. */
export function longestStreak(daySet) {
  const days = [...daySet].sort((a, b) => a - b);
  let best = 0; let run = 0; let prev = null;
  for (const d of days) { run = prev !== null && d === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

export const timeOfDay = (hour) => (hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : 'night');
const PERSONALITY = { morning: 'Early bird', afternoon: 'Afternoon groover', evening: 'Evening listener', night: 'Night owl' };

const top = (map, limit) => [...map.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds || String(a.name).localeCompare(String(b.name))).slice(0, limit);
const bump = (map, key, name, seconds, extra = {}) => {
  const row = map.get(key) || { name, plays: 0, seconds: 0, ...extra };
  row.plays += 1; row.seconds += seconds;
  map.set(key, row);
};

/**
 * @param {{ songId: string, playedAt: Date|string|number, completed?: boolean, listenedSec?: number|null, durationSec?: number|null }[]} events  that year's events
 * @param {Map<string, object>} songsById
 * @param {{ year: number, tzMinutes?: number }} opts
 */
export function buildWrapped(events, songsById, { year, tzMinutes = WRAPPED.defaultTzMinutes } = {}) {
  const counted = events.filter(isCounted);
  const songs = new Map(); const artists = new Map(); const films = new Map(); const composers = new Map(); const eras = new Map();
  const days = new Map(); const weekdays = new Array(7).fill(0); const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  let totalSeconds = 0; let first = null;

  for (const e of counted) {
    const song = songsById.get(e.songId);
    if (!song) continue; // a song that no longer exists cannot be named
    const seconds = secondsListened(e, song);
    totalSeconds += seconds;
    const at = new Date(e.playedAt).getTime();
    if (!first || at < first.at) first = { at, song };

    const key = variantKey(song);
    bump(songs, key, song.title, seconds, { id: song.id, title: song.title, artist: song.artist, album: song.album || song.movie || null, image: song.image || null });
    for (const n of names(song.artist).slice(0, 2)) bump(artists, n.toLowerCase(), n, seconds);
    const film = (song.movie || song.album || '').trim();
    if (film) bump(films, film.toLowerCase(), film, seconds);
    if (song.composer) for (const c of names(song.composer).slice(0, 1)) bump(composers, c.toLowerCase(), c, seconds);
    if (song.year) bump(eras, decadeLabel(Number(song.year)), decadeLabel(Number(song.year)), seconds);

    const { day, hour, weekday } = localParts(at, tzMinutes);
    const d = days.get(day) || { plays: 0, seconds: 0 };
    d.plays += 1; d.seconds += seconds; days.set(day, d);
    weekdays[weekday] += 1;
    buckets[timeOfDay(hour)] += 1;
  }

  const plays = [...songs.values()].reduce((n, s) => n + s.plays, 0);
  const ready = plays >= WRAPPED.minPlays;
  const minutes = Math.round(totalSeconds / MIN);
  const busiest = [...days.entries()].sort((a, b) => b[1].seconds - a[1].seconds || a[0] - b[0])[0];
  const bucket = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
  const weekday = weekdays.indexOf(Math.max(...weekdays));
  const eraTop = top(eras, 1)[0];
  const shape = (row) => ({ ...row, minutes: Math.round(row.seconds / MIN), seconds: undefined });
  const person = (row) => ({ name: row.name, plays: row.plays, minutes: Math.round(row.seconds / MIN) });

  return {
    year,
    ready,
    minPlays: WRAPPED.minPlays,
    totals: {
      minutes, hours: Math.round(totalSeconds / 360) / 10, plays,
      distinctSongs: songs.size, distinctArtists: artists.size,
      activeDays: days.size, longestStreak: longestStreak(new Set(days.keys())),
    },
    topSongs: ready ? top(songs, WRAPPED.topSongs).map(shape).map(({ name, ...rest }) => rest) : [],
    topArtists: ready ? top(artists, WRAPPED.topArtists).map(person) : [],
    topFilms: ready ? top(films, WRAPPED.topFilms).map(person) : [],
    topComposers: ready ? top(composers, WRAPPED.topComposers).map(person) : [],
    topEra: ready && eraTop ? { label: eraTop.name, share: Math.round((eraTop.plays / Math.max(1, [...eras.values()].reduce((n, r) => n + r.plays, 0))) * 100) } : null,
    busiestDay: ready && busiest ? { date: dayLabel(busiest[0]), minutes: Math.round(busiest[1].seconds / MIN), plays: busiest[1].plays } : null,
    favouriteWeekday: ready ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday] : null,
    timeOfDay: ready && bucket[1] > 0 ? { part: bucket[0], label: PERSONALITY[bucket[0]] } : null,
    firstSong: ready && first ? { title: first.song.title, artist: first.song.artist, date: dayLabel(localParts(first.at, tzMinutes).day) } : null,
  };
}
