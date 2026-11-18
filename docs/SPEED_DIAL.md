# Speed Dial: how the ranking works

The home page shows up to 9 tiles of the songs a user plays most. All numbers are in
`backend/src/services/speedDial/config.js`; edit them there, nothing else needs to change.

## What counts as a play
A play is recorded only once the user has listened **30 seconds or half the song** (whichever comes first), or the song
played to the end. The player reports it once per play, with a client-made `playId`; if the song later completes, the
same row is updated, so a play is never counted twice. The **server** re-checks the rule (`POST /api/me/play-events`),
so a client cannot inflate counts. A song skipped before it counts is stored as an "early skip" (kept only if the user
listened at least 2 seconds) and lowers that song's score a little.

## Score
For each song, add up its plays in the last `windowDays` (90):

    play        = playWeight (1.0)  + completionBonus (0.5, if played to the end)
    early skip  = -skipPenalty (0.5)
    score       = sum( play-or-skip  x  0.5 ^ (ageInDays / halfLifeDays) )      halfLifeDays = 14

So a play loses half its weight every 14 days: 20 plays last week outrank 30 plays two months ago, and anything older
than 90 days is ignored. A song needs at least one counted play and a score of `minScore` (0.2) to be "most played".

| Knob | Default | Effect |
|---|---:|---|
| `slots` | 9 | tiles in the grid |
| `windowDays` | 90 | older plays are ignored |
| `halfLifeDays` | 14 | smaller = favourites change faster; larger = long-term favourites win |
| `playWeight` / `completionBonus` | 1.0 / 0.5 | how much a play / a full listen is worth |
| `skipPenalty` | 0.5 | how hard an early skip counts against a song |
| `countedAfterSeconds` / `countedAfterFraction` | 30 / 0.5 | what counts as a play |
| `minScore` | 0.2 | below this a song is not "most played" yet |
| `cacheSeconds` | 60 | per-user result cache (cleared when a play is recorded or an override changes) |

## The grid (assembled in `assemble.js`)
1. Hidden ("Remove") songs are excluded everywhere.
2. Pinned songs take their slot and are never replaced by the ranking. Two pins on one slot: the newer keeps it.
3. Empty slots are filled by rank, then by suggested popular Tamil songs (the trending shelf), marked `source: "suggested"`.
4. Gaps are closed, so tiles are always dense and in grid order. The 3 highest-scoring played songs get `hot: true` (flame).
- **Drag and drop** pins the dragged tile at its new slot (the others keep following the ranking). "Unpin" returns a tile
  to automatic ranking; `DELETE /api/me/speed-dial` clears all pins and hidden songs.
- **Logged-out users** keep play counts in the browser; on sign-in they are imported (at most 5 events per song, 50
  songs, stable ids so signing in twice cannot double count).

## API
`GET /api/me/speed-dial`, `POST /api/me/speed-dial/pin`, `DELETE /api/me/speed-dial/:songId` (hide),
`DELETE /api/me/speed-dial/:songId/pin`, `PUT /api/me/speed-dial/order`, `POST /api/me/speed-dial/import`,
`DELETE /api/me/speed-dial` (reset), `POST /api/me/play-events`. All need a login.

## Data
`play_events` (migration `20261120000000_speed_dial`) gains `playId`, `listenedSec`, `durationSec`, plus the index
`(userId, songId, playedAt)`; `speed_dial_overrides` holds pins and hidden songs (unique per user and song). The ranking
is one grouped SQL query over `play_events`. UNTESTED on real Postgres until the suite runs with `TEST_DATABASE_URL`
(the same tests then check that the SQL and the JavaScript reference agree).

## On the home page (frontend)
Order: greeting ("Vanakkam, <name>") -> **Speed dial** -> Featured -> Recently played -> Made for you -> the existing shelves.
Speed Dial replaces the old "Quick picks" grid. 3x3 tiles on phones, 5 + 4 on wide screens.
- **Tap** plays the song and queues related songs (interim radio: `lib/startRadio.js`; if the radio returns nothing, the
  other tiles are queued instead). Tapping the song that is playing pauses it; the playing tile shows an equalizer.
- **Long-press** (phone), the **"..." button** or **right-click** opens the menu: Play, Add to queue, Go to artist, Pin /
  Unpin, Move earlier / later, Remove. Signed-out visitors see "Sign in to pin, move or remove songs".
- **Drag and drop** (desktop) pins the dragged tile where it lands; already-pinned tiles it shifts keep their place.
- **Reporting plays**: `components/player/PlayTracker.jsx` (invisible) watches the player and reports a play once it
  counts (`lib/playTracker.js`: real listening time only, so seeking does not count). Signed-out plays are counted in
  localStorage (`lib/guestPlays.js`) and imported on sign-in.
- **Made for you** shows a radio mix for each of your three most-played songs.
- Tamil wording on the home page ("அடிக்கடி கேட்டவை", "உங்களுக்காக") needs a native check.
