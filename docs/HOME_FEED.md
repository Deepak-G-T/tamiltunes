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
