# Radio: related-song ranking

`GET /api/songs/:id/related?limit=20&exclude=id1,id2` returns songs related to a seed song, scored, varied and free of
repeats. The player uses it to fill "Up next" and to keep refilling. All numbers live in
`backend/src/services/related/weights.js`: edit them there; no other code changes are needed.

## How a batch is built
1. **Candidates** (cached 5 minutes per seed song): the music provider's own recommendations, songs from the same film,
   by the same lead singer, by the same composer (when the provider tells us), songs that share playlists or listeners
   with the seed in our database, and same-language songs from the home-feed shelves (trending, melodies, 90s, gana...)
   as a fallback. Duplicates (same id, or same title + artist) are dropped, and so is the seed.
2. **Score** every candidate (table below). A song scoring below 0 (wrong language, played a moment ago, skipped
   early) never enters a batch.
3. **Mix**: about 30% of the batch is "discovery" (less similar, most popular first), spread evenly through the list;
   the rest is very similar (score at or above 2.0).
4. **Break up runs**: never more than 3 songs in a row from the same artist or the same film.
5. **Exclude**: ids in `exclude` (everything already played this session) and the seed are never returned.

## Weights (score = sum of the signals that apply)
| Signal | Weight | Meaning |
|---|---:|---|
| `sameComposer` | +3.0 | same music director (only when the provider supplies one) |
| `sameMovie` | +2.5 | same film / album (names are normalised: "(From Leo)", "Soundtrack" ignored) |
| `sharedSinger` | up to +2.0 | multiplied by the share of the seed's singers that also sing this song |
| `coListening` | up to +2.0 | shared playlists / shared listeners; log scale, full weight at 5 co-occurrences |
| `providerRecommendation` | +1.5 | JioSaavn itself recommends it |
| `era` | +1.5 / +1.0 / +0.5 / +0.2 | release year within 1 / 3 / 7 / 12 years |
| `sameLanguage` | +1.0 | |
| `sameShelf` | +0.8 | both on the same home-feed shelf: a stand-in for genre and mood (no genre data exists) |
| `popularity` | up to +0.4 | tie-breaker only, from the provider's play count (log scale) |
| `liked` | +0.6 | the signed-in user liked this song |
| `recentlyPlayed` | -3.0 | played in the last 6 hours |
| `skippedRecently` | -2.5 | skipped before 30 seconds in the last 7 days |
| `differentLanguage` | -10.0 | stronger than everything positive combined, so Telugu/Hindi never appear |

Other knobs: `VARIETY.maxRun` (3), `VARIETY.discoveryRatio` (0.3), `VARIETY.similarMinScore` (2.0),
`LIMITS.candidatePool` (120), cache lifetimes, `USER_WINDOWS` (6 h recent, 7 days skips, 30 s "early").

## Tuning tips
- Radio feels samey: raise `discoveryRatio`, lower `sameComposer`/`sameMovie`.
- Radio feels random: lower `discoveryRatio`, raise `similarMinScore`.
- Always the same artist: lower `VARIETY.maxRun` to 2.
- Each response includes `why` ("Same singer", "From the same film", "Something different") for the queue UI.
  Add `console.log` of `reasons` in `relatedService.js` if you need to see exactly why a song was picked.
- Run `node backend/test/related.test.js` after changing weights: it pins the intended ordering.

## Data and caveats
- The `songs` table only holds songs somebody liked, played or saved, so most candidates come from the provider, not
  our database. Co-listening starts near-empty and improves as people use the app.
- Genre, mood and tempo are not in the provider data; `sameShelf` is the only mood-like signal.
- Composer comes from JioSaavn's artist map when present; songs without it simply do not earn `sameComposer`.
- `reco.getreco` (provider recommendations) is **UNTESTED against the live JioSaavn API** from this repo's sandbox.
  If it returns nothing in production the ranking still works from search + shelves + co-listening.
- `play_events` (completions and skips) is created now; the app starts writing to it in the player phase.
