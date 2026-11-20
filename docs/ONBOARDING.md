# Onboarding: the first-login taste picker

A new account is asked once to pick favourite **singers**, **music directors** and **eras**, so the Daily Mixes have something to work with on day one.

## Who sees it
- A signed-in person with **no saved picks and fewer than 20 plays** (`GET /api/me/taste` says `shouldOnboard: true`). The app takes them to `/welcome` **once per browser session**
  (`OnboardingGate`, in `MainLayout`).
- Not interrupted: anyone who already chose (or skipped), and regular listeners (20+ plays). Guests never see it (nothing to save to). If the server cannot be reached, the app just opens.
- **Skip for now** at every step saves a "skipped" row, so they are not asked again. Settings > **Choose your favourites** opens the same screen later (`/welcome?edit=1`, prefilled).

## What is saved (private)
Table `user_taste` (one row per person): `artists`, `composers`, `eras`, `skipped`. **Only names from a fixed list** (`backend/src/services/taste/options.js`; English names; limits 12 / 8 / 5);
the API rejects anything else (no free text, no extra fields, no duplicates). Deleting the account deletes the row (cascade).
Nothing here is public; it is not shown on the profile (the old public profile fields `favoriteArtists` and `genres` are separate and untouched).

## What it changes (until real listening takes over)
- **Daily Mix 1-3**: seeds = what they really play first, then their picks (singers and music directors in turn), then a guest's browser hints (`mixSeeds` in `homeFeedService.js`).
  Once someone has six played artists the picks step aside.
- **Shelf order**: a picked era moves its shelf up, just before "Trending now" (90s, 2000s, 2020s have shelves; 2010s and before 1990 have none yet, so they change nothing). Nothing is added or removed.
- Saving clears the Home cache so the next draw uses the picks.
NOT done (later): using the picks to seed the radio, "Taste Radio" ordering, a shelf for 2010s / older songs.

## API
`GET /api/me/taste` -> `{ taste | null, shouldOnboard, options: { artists, composers, eras, limits } }`; `PUT /api/me/taste` `{ artists, composers, eras, skipped? }` (an empty save counts as a skip);
`DELETE /api/me/taste` (forget; asked again). All require sign-in. **Migration `20261129000000_user_taste`** (additive, idempotent; Neon backup BEFORE merging).

## Tests
`backend/test/taste.test.js` (seeds, era order, fixed list, API, validation, skip/forget, regular listeners, Home day one; also run on Postgres), `frontend/src/lib/taste.test.js`,
and the browser audit `npm run test:onboarding --prefix frontend` (52 checks: redirect once, limits, steps, finish/skip/edit, failures, 360x640 / 390x844 / 412x915 with a 28px status bar, 24px gesture bar and 130% font).

UNTESTED: a real new Google account end to end, the Settings button in a browser, a real phone, how good the first Daily Mixes are with the live catalogue (the mock provider was used).
