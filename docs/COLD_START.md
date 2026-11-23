# Slow first request (the server "wakes up")

On Render's **free** plan the backend sleeps after **15 minutes without a request**. The next request has to start the whole server again (about 30 seconds), and Neon (the
database) also sleeps after about 5 idle minutes and needs 1 to 3 seconds to wake. The two add up. Nothing is wrong: it is the price of the free plans.

## What the code does about it
- **Migrations run at build time**, not at start (`render.yaml`: `buildCommand` ends with `npx prisma migrate deploy`, `startCommand` is just `npm start`). Before, every wake-up ran
  `prisma migrate deploy` first, which has to connect to a sleeping database: several seconds on every wake-up. After merging, check the Render dashboard (Settings > Build & Deploy):
  if the Build and Start commands were typed there by hand, change them to the same values; the file is only used by a Blueprint.
- **The port opens immediately** (`backend/src/startup.js`): `/api/health` and CORS preflights answer at once while the database connects; every other request waits for the database
  (never served by the in-memory fallback). Render's proxy no longer answers 502/503 during the start, so the app needs fewer retries (they waited 2.5 s and 5 s each).
- **The app wakes the server early** (`frontend/src/lib/warmUp.js`): a silent ping to `/api/health` when the app opens and when it comes back to the front (at most once every 4 minutes),
  so the server is often awake by the time you tap Sign in or Play. `/api/health` never touches the database, so it does not wake Neon or use its hours.
- While waiting, the app shows "Waking up the server..." and retries reads quietly (`lib/coldStart.js`).

## Keep the server awake (free, 5 minutes)
A pinger that calls the health address every 5 to 10 minutes stops Render from sleeping, so there is no 30 second wait at all.
1. Create a free account at **UptimeRobot** (or cron-job.org).
2. Add a monitor: type HTTP(s), URL `https://tamiltunes-backend.onrender.com/api/health`, interval 5 minutes.
3. Render's free plan gives 750 instance hours a month, enough for ONE service awake all month (744 hours). If you run other free web services on the same account they share those hours.
- The health check does not use the database, so Neon still sleeps when nobody is using the app (it wakes in 1 to 3 seconds on the first real request) and its free compute hours are not used up.
- Do NOT point the pinger at a route that reads the database: that keeps Neon awake all day and can use up its monthly free hours.

## The real fix: Render Starter (about $7 a month)
The paid plan never sleeps. Switch it in the Render dashboard (Settings > Instance Type). With it the pinger is not needed.

## Not measured
No timings were measured on your Render account. The pinger removes the wait; the other changes save a few seconds on the wakes that still happen. Look at the Render logs
("Connected to PostgreSQL" and "running on") to see where the time goes.
