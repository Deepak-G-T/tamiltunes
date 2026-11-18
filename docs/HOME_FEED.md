# Home page feed

`GET /api/home` builds every shelf below Speed Dial in one go, so a song shows up once on the page.

## Why songs repeated (before)
Each shelf was its own search (`/api/music/home` ran about 10 JioSaavn searches), so the same artists and films came back in several
shelves, and a shelf only removed repeats inside itself. Some shelves were copies by design (when a search returned nothing,
`latest` fell back to `trending`, `sad` to `nineties`, `love` to `melodies`). The 90s and 2000s shelves were not filtered by year.
The featured hero came from Trending, Speed Dial's empty slots were filled from the top of Trending, and "Recently played" mostly
equals Speed Dial.

## How it works now
- **One shared "already shown" set.** Sections are filled in priority order (hero, Continue listening, Made for you, Trending now,
  New releases, 90s melodies, 2000s hits, then Popular artists / albums as cards). Speed Dial songs are sent by the page as
  `?exclude=id1,id2,...` (also for guests, whose plays live only in the browser), so they never appear again below.
- **Same song, different id.** `services/homeFeed/normalize.js` cleans titles (`(From "Movie")`, `- From "Movie"`, remastered,
  video song ...), compares them with the movie and the singers, and treats look-alikes as one song. The same title in two
  different films, or by different singers, stays two songs.
- **Each shelf has its own pool.** Continue listening = your latest songs. Made for you = songs by your top artists (last 90 days),
  minus songs you played in the last 7 days. Trending now = most counted plays across everyone (last 14 days), then the provider's
  trending list. New releases = release year this or last year, newest first. 90s melodies = year 1990-1999. 2000s hits = 2000-2009.
  Songs without a release year never fill a year shelf. A section with fewer than 8 unique songs is hidden, never padded with repeats.
- **Variety.** At most 2 songs per movie and 3 per artist in a section. Candidates are picked by weighted random, seeded by person and
  day (UTC), so the page is the same on every refresh and Back, and different tomorrow and for someone else. Songs counted 3+ times
  this week are pushed down (they belong in Speed Dial); songs never played this week are lifted.
- **Cheap.** The assembled page is cached per person for 3 minutes in memory; provider searches for 10 minutes. The database part is
  four small grouped queries limited by index (`play_events(userId, playedAt)`, `(playedAt)` - migration `20261122000000`).
- **Category chips** (`?tab=melodies`, ...) return that category's own pool (up to 30), deduped only inside itself.

## Tuning
Minimum/maximum per shelf, the caps and the rotation limit are constants at the top of `services/homeFeed/assemble.js`; the extra
searches per pool are in `QUERIES` in `homeFeedService.js`.

## UNTESTED
The live JioSaavn pools (the tests use the offline catalogue and synthetic pools), and how full each shelf is with real data: a
shelf with fewer than 8 unique songs is hidden, so a thin pool shows as a missing shelf.

## A fresh mix on every visit, Daily Mix (feature/home-fresh-mixes)
The page used to be the same all day (seeded by person + day). Now it changes like Spotify / YouTube Music:
- **Visit token.** The page makes a random `visit` token on every app open (`lib/homeVisit.js`) and a new one when you pull down or tap the refresh button
  (`hooks/useHomeFeed.refresh`, `hooks/usePullToRefresh.js`). The server seed is `person:day:visit`, so a new token is a new mix; the same token is
  stable (Back, switching tabs). Category chips keep the same token.
- **Rotation.** The ids shown last time are kept in localStorage (`tamiltunes_home_shown_v1`, 80 ids) and sent as `?avoid=`; they are treated like
  songs played 3+ times this week (weight x0.15): they sink but stay if a shelf would otherwise be thin (never empties a shelf, never repeats on the page).
- **Daily Mix 1-3.** Each mix is two of your favourite artists (most played in 90 days, a liked song counts as 3 plays) with a subtitle ("A, B and more");
  pool = provider searches `"<artist> tamil songs"` and `"<artist> hits"`, minus songs played this week. They replace "Made for you"
  (which stays as the fallback when there is no taste yet). A mix with fewer than 8 songs is hidden. Logged-out listeners send their top artists from
  this browser (`?artists=`, up to 6, from `guestPlays`), so guests get mixes too.
- Query params (all optional, validated): `visit` (<=24 chars `[\w-]`), `avoid` (<=80 ids), `artists` (<=6 names). The 3-minute cache key includes them.
- Tuning: `MAX_MIXES`, `MAX_AVOID`, `planMixes` in `homeFeedService.js`; `LIKE_POINTS` in `signals.js`; `PULL_THRESHOLD` in `usePullToRefresh.js`.
- UNTESTED: the live pools (how many songs `"<artist> tamil songs"` returns for your real top artists), real-phone pull feel.
