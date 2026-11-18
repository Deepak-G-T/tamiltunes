# Play queue v2 (Part G)

## What you see
- **Queue panel**: right-side panel on desktop (`q` or the queue icon in the player bar), bottom sheet on phones (queue icon in the mini
  player, swipe the handle down to close), and a **Queue tab inside Now Playing**. Tabs: **Queue** and **History** (last 50 songs; tap to replay).
- **Sections**: Now playing (cover, equalizer) / Next in queue (songs you added, always first) / Next from radio or from the playlist or album.
  Radio songs carry an **Autoplay** label. **Refresh recommendations** replaces them with a new set; your own songs stay.
- **Header**: Clear queue, Save as playlist (signed-in users), Select, a menu (Stop after this song, sleep timer 15/30/60 min or end of song,
  Remove playing song), time left, Autoplay switch.
- **Everywhere**: the song "..." menu (Play now, Start radio, **Play next**, **Add to queue**, Add to playlist) is on search results, Speed Dial,
  playlists, albums, artist pages, Favourites, History and the full-screen player.
- A song that is already queued asks "Already in queue": **Add again** or **Move the queued copy**. The queue holds at most 500 songs.

## Controls
- Drag the handle (mouse, touch, or keyboard: Space, arrows, Space) with live announcements. **Alt+Up / Alt+Down** moves the focused row, arrows move
  between rows, **Enter** plays, **Delete** removes. Swipe a row left to remove on a phone. Removing (also several at once with Select) shows **Undo**.
- Shortcuts: `n` next, `p` previous, `q` queue, Space, `m`, Shift+arrows. Media Session next/previous follow the queue.
- Long queues (over 100 upcoming songs) render only the rows on screen. `prefers-reduced-motion` turns animations off.

## Engine (`frontend/src/lib/radioQueue.js`)
Every queue slot has its own `uid`, so the same song can be queued twice. Old saved snapshots without ids are repaired on load (`normalizeEntries`).
New functions: `findQueued`, `moveToQueue`, `moveManyToQueue`, `removeByUids` / `restoreRemoved` (Undo), `clearRadio` (refresh), `removeCurrent`,
`playFromHistory`, `setStopAfter`, `isQueueFull`. Radio refills at fewer than 3 songs and never repeats the last 500 played or skipped songs
(`played`, capped at 500). Sleep timer: `lib/sleepTimer.js`.

## Saving the queue
- Guests: `localStorage` (`tamiltunes_queue_v1`). Signed in: the account, via `PUT /api/me/queue`, debounced about 2 s, also when the tab is hidden or closed.
- Only **song ids** are saved. On restore the server looks the songs up again (database first, then the music provider, at most 40 provider lookups
  per restore); songs that no longer exist are dropped with a short notice. A queue restores **paused** at the saved position and never auto-plays.
- The first request after Render or Neon idles is retried quietly (1 s, 2 s, 4 s); the user sees no error.
- **Another device**: on app open and when the tab comes back into view (at most every 30 s, no polling) the app asks `GET /api/me/queue/meta`.
  If another device saved later: "Continue on this device?" (last write wins).

## API
| Route | Notes |
|---|---|
| `GET /api/me/queue` | auth; saved queue plus fresh song data |
| `GET /api/me/queue/meta` | auth; cheap: updatedAt, deviceId, count |
| `PUT /api/me/queue` | auth, zod-validated, ids only, max 551 items (50 history + current + 500), 30 requests/min |
| `DELETE /api/me/queue` | auth |
| `POST /api/music/songs/resolve` | no login (guests restoring), up to 100 ids, 12 requests/min per address |
| `POST /api/playlists/from-queue` | auth; `{ name, songIds }`, private playlist, 6 requests/min |

## Database
Migration `20261121000000_queue_state`: one new table `queue_state` (one row per user, `items` jsonb, `current_index`, `position_sec`, `shuffle`,
`repeat`, `autoplay`, `mode`, `source_label`, `device_id`, `updated_at`), cascades when the user is deleted. Additive and safe to run twice.
Run it with the UNPOOLED url: `npm run migrate --prefix backend`.

## Tests
`npm test --prefix frontend` (engine, persistence, view model, sleep timer), `npm test --prefix backend` (`queue-api.test.js`),
`npm run test:queue --prefix frontend` (Playwright: open, add, duplicates, reorder by keyboard and mouse, remove with Undo, multi-select,
history, shortcuts, restore, 260-song list, phone layouts at 360x640 and 390x844).

## UNTESTED
Touch drag and swipe on a real phone, a second real device for "Continue on this device?", a signed-in account in the browser tests
(the API is tested with real Postgres, the screens only as a guest), and Neon itself (a local scratch Postgres 16 was used).
