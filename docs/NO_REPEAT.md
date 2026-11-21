# No repeats (the simple rule)

**The same song must not appear twice inside the queue.** That is the whole rule. Listening history is not a rule: a song played yesterday (or a minute ago) may come back.
(The first version of this feature had a 200-song rolling history, a 7-day cool-down, a 30-day skip cool-down and a memory of everything played in the session. It emptied
the queue ("You've heard everything close to this" with one song left), so all of that was removed.)

"Same song" = the same canonical song (`songIdentity.js` / `backend/src/services/related/identity.js`): another id, another cover or album, another spelling ("Annul Maelae" / "Annul Melae"),
the singers in another order.

## What the radio leaves out (the hard rules)
1. The **playing song** and **versions of it** (unplugged, remix, acoustic ...).
2. Songs **already in the queue** (what you added and the radio's block), and any copy of them under another id, cover or spelling.
3. One copy of a song **inside a batch** (the best version: original release over a compilation).
4. Songs you chose **"Don't recommend this"** for (and their versions), and hidden / deleted songs. This is the only thing a listener chose to keep out, so it stays.

Versions of a song that is only *queued* are allowed (only the playing song is protected from its versions).

## The one soft preference
Prefer songs that are **not among the last 20 played** (`NO_REPEAT.recentAvoid`). It is only a preference: when fewer than **15** songs would remain without them
(`NO_REPEAT.softMinPool`), it is dropped first and the small pool is used as it is. The app sends its last played ids (`recent`, newest first, at most 50); the server uses the first 20.
Ranking nudges from the original radio stay (`recentlyPlayed` -3 for 6 hours, `skippedRecently` -2.5 for 7 days) but they only move a song down the list, never remove it.

## Keeping the queue stocked
- The app asks for more when **fewer than 5** songs remain (`REFILL_THRESHOLD` in `radioQueue.js`) and requests **50** (`REFILL_BATCH`; the server caps at 60).
- If a batch has fewer than 15 candidates after the hard rules, the server widens the search step by step: same music director, same era, same language, trending in the language (`NO_REPEAT.widenSteps`).
- After every refill the **whole queue is checked** (`cleanRadioDuplicates`): a duplicate radio row is removed, keeping the first. Songs you added yourself, and playlist / album rows, are never touched.
  The same check runs when a queue is loaded or restored, when the playing song changes, and on "Refresh recommendations".

## What the person sees
- **"Out of new songs"**: a small one-line banner, only when the server says nothing is left that is not already in the queue, even after widening (`meta.exhausted`). It is about the playing song:
  the next song asks again. Play history can never cause it.
- **"Couldn't load more songs - Retry"**: a small banner when the request failed. Retry asks again at once (the app also retries by itself with a 1 s to 30 s back-off).
- Adding a duplicate by hand still asks **"Already in queue - add again?"**, and the radio never touches what you added.

## Settings (one file)
`backend/src/services/noRepeat/config.js`: `recentAvoid` 20, `softMinPool` 15, `maxRecent` 50, `minCandidates` 15, `widenSteps`, `maxBlocks`, `maxExclude`, and the Home page's own numbers
(`homeSkipPlayedHours` 24, `homeShelvesExempt`). Frontend: `REFILL_THRESHOLD` 5, `REFILL_BATCH` 50 in `frontend/src/lib/radioQueue.js`.

## Where it lives
| Part | Where |
| --- | --- |
| Hard rules and the soft preference | `services/noRepeat/filter.js` (`filterCandidates`, `softAvoidRecent`) |
| The radio batch (hard rules, widening, soft preference, ranking) | `services/related/relatedService.js` (`getRelated`) |
| Block list ("Don't recommend this") | `services/noRepeat/memory.js`, `blocksStore.js`, `GET/POST/DELETE /api/me/blocks` |
| Widening ladder | `services/noRepeat/widen.js` |
| Endpoint | `GET /api/songs/:id/related?limit=50&exclude=<queue ids>&recent=<last played ids>` |
| Queue engine, refill, dedupe, banners | `frontend/src/lib/radioQueue.js` (`filterNewSongs`, `cleanRadioDuplicates`, `applyRefill`, `isExhausted`, `refillFailedBanner`, `retryRefill`) |
| Banners | `components/player/queue/QueueContent.jsx` (`queue-banner-exhausted`, `queue-banner-error`) |

## Home page (unchanged by this simplification)
The Home feed has its own rules: one song once across the shelves (same song, any id), shelves skip songs played in the last 24 hours (not "Continue listening", Speed Dial, Liked), blocked songs
are left out, thin shelves are hidden (`docs/HOME_FEED.md`). That 24-hour rule is a history rule too; it was not part of the queue problem and is still on. Say if it should go as well.

## Removed, and what is left behind
- Removed: the 200-song rolling history, both cool-downs, the session memory (`heard`), "Allow repeats", "Play something different", the home-page exclusion (`shownOnHome`), the big "heard everything" card.
- `PUT /api/me/queue` still accepts `heard` / `allowRepeats` from older apps and ignores them. The database columns `queue_state.heard` and `queue_state.allow_repeats` (migration
  `20261128000000_no_repeat`) are now unused and still in place; they can be dropped in a later migration. **No new migration in this change.**

## Tests
`backend/test/no-repeat.test.js` (hard rules on the reported pairs, the soft preference, a 300-song simulated session with refills of 50, yesterday's song can return, a small pool still fills,
"out of new songs" only when everything is queued, blocks), `backend/test/no-repeat-api.test.js` (also on Postgres), `frontend/src/lib/noRepeat.test.js` and `radioQueue.test.js`, and the browser audit
`npm run test:refill --prefix frontend` (28 checks: refill at 5, 50 per request, only the queue excluded, history can come back, both banners, Retry, 360x640 / 390x844).

UNTESTED: the live JioSaavn catalogue (how many songs each refill really finds), a real phone.
