# TamilTunes Wrapped

A year in listening for each person: minutes, top songs, artists, films, music director, when they listen, streak, era. Private to them; they choose whether to share a picture.

## Where it shows
- Home banner "Your 2026 Wrapped is ready" and a Profile link, from **1 December to 31 January** (in January it offers the year just ended). The window lives in `frontend/src/lib/wrapped.js` (`wrappedWindow`).
- The story is the page `/wrapped?year=2026` (signed-in only). It can be opened at any time by address; only the promotion follows the calendar.
- Not enough listening (fewer than 20 counted plays): one friendly screen with the real progress ("7 / 20"). No numbers are invented, no names are shown.

## The numbers (`backend/src/services/wrapped/build.js`)
- A **counted play** = finished, or at least 30 s listened (the Speed Dial rule). Skips under 30 s are not counted.
- **Minutes** = seconds really listened (a finished song with no listened time counts as its length; never more than 1.1 x the song, so a paused tab cannot inflate it).
- The same song under another id, spelling or version (unplugged ...) is **one song** (`variantKey`, same as the no-repeat rules). A duet counts for the first two singers.
- The year runs from 1 January to 31 December **in the person's own time zone**: the app sends the phone's offset (`tz`, minutes; the default is India, 330).
- "Listening style": Early bird (05-11), Afternoon groover (12-16), Evening listener (17-21), Night owl (22-04). Longest streak = most consecutive days with a play.
- Songs that no longer exist in the database are ignored.

## API
`GET /api/me/wrapped?year=2026&tz=330` (signed in). Returns `{ success, wrapped }` with totals, `topSongs`, `topArtists`, `topFilms`, `topComposers`, `topEra`, `busiestDay`, `favouriteWeekday`, `timeOfDay`, `firstSong`.
No user id or email in the answer. A year before 2025 or in the future is a 400. Cached in memory for 5 minutes per person, year and time zone.
**No migration**: it reads `play_events` (indexed by user and time) and `songs`.

## The share picture
Drawn in the browser on a 1080x1920 canvas (`drawShareCard`): minutes, top song, artist, film and listening style. Nothing is uploaded.
- Website: the **Share** button hands the PNG to the system share sheet (Web Share with files). Touch and hold the picture to save it.
- Android app: the WebView cannot share a file, so Share sends the text and the site link. (The project keeps downloads and file storage out of the app on purpose: `noMediaStorage.test.js`.)
- The preview is a data URL; no object URLs or download links are used.

## Tests
`backend/test/wrapped.test.js` (numbers, time zone, API; also run on Postgres), `frontend/src/lib/wrapped.test.js`, and the browser audit `npm run test:wrapped --prefix frontend`
(43 checks: banner by date, the story at 360x640 / 390x844 / 412x915 with a 28px status bar and 24px gesture bar, share, tap zones, not-enough and error screens).

UNTESTED: a real year of plays on Neon; the system share sheet, touch-and-hold save, tap zones and the layout on a real phone; the app's text-and-link share; Tamil titles in the picture on a real phone font.
