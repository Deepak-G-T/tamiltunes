# No-repeat guarantee

Goal: the queue, autoplay, Daily Mix and the Home shelves never play the same song twice by accident.
"Same song" means the same *canonical* song: re-uploads, compilation copies, spelling variants (`Annul Maelae` / `Annul Melae`) and
versions (`Pavazha Malli` / `Pavazha Malli (Unplugged)`) all count as one (see `docs/RADIO.md`, `songIdentity.js`, `identity.js`).

## Settings (one file)
`backend/src/services/noRepeat/config.js`: rolling history 200, session memory 600, cool-down 7 days after a full listen,
30 days after an early skip (< 30 s), liked songs return in Taste Radio after 24 h, widen when fewer than 10 fresh songs,
Home skips songs played in the last 24 h (not "Continue listening", Speed Dial, Liked), block limit 1000.

## Where it lives
| Part | Where |
| --- | --- |
| Memory (played, rolling 200, cool-downs, blocks) | `services/noRepeat/memory.js` (loaded from `play_events`, `queue_state.heard`, `user_song_blocks`) |
| Filter order: a) in queue, b) heard, c) cooling / hidden, d) variant of playing or queued | `services/noRepeat/filter.js` |
| Widening ladder: composer, era, language, trending | `services/noRepeat/widen.js`, used by `relatedService.getRelated` |
| Exhausted: `meta.exhausted` (nothing fresh after widening) | `relatedService` + app card "You've heard everything close to this" |
| Allow repeats (only after the listener agrees): least recently played first, flagged `repeat` | `GET /api/songs/:id/related?allowRepeats=1` |
| Session memory saved with the queue (`heard`, `allowRepeats`), shared by devices | `PUT/GET /api/me/queue`; guests keep it in the browser queue copy |
| "Don't recommend this" | `GET/POST/DELETE /api/me/blocks` (`POST` takes only `songId`), app: row menu, Settings > Blocked songs |
| Home | `homeFeed/assemble.js` (one identity set in section order; 24 h skip; blocked; thin shelves hidden) |
| Frontend engine | `frontend/src/lib/radioQueue.js` (`collectHeard`, `filterNewSongs`, `allowRepeatsNow`, `playSomethingDifferent`, `refreshRecommendations`) |

## Rules worth remembering
- Blocked songs (and their versions) never return, not even with "Allow repeats".
- Repeat modes, manual adds, playlists, albums and Liked songs keep their own order. Autoplay after them is filtered against everything they played.
- The playing and queued songs are never repeated, even with "Allow repeats". The server re-checks against the live queue (the app also checks again right before inserting).
- Saved memory holds compact keys (`variantKey`), not titles. Spelling variants older than the last 50 songs are caught by the server (it has the song data); the app matches exact keys for them.
- Existing queues are cleaned when loaded and on "Refresh recommendations": autoplay rows that repeat an earlier row or the playing song are removed (the first stays); songs you added are never touched.

## Migration
`20261128000000_no_repeat` (additive, idempotent): `queue_state.heard`, `queue_state.allow_repeats`, table `user_song_blocks`.
Take the Neon backup BEFORE merging (Render runs `migrate deploy`).

## Tests
`backend`: `no-repeat.test.js` (fixtures, cool-downs, blocks, 500-song session, widening, exhaustion, repeats), `no-repeat-api.test.js`
(memory shared by devices, blocks; also run on Postgres), `no-repeat-home.test.js`. `frontend`: `src/lib/noRepeat.test.js`.

UNTESTED: live JioSaavn pools (widening quality), the "heard everything" card and the row menu item in a browser/phone, guests blocking songs (needs sign-in).
