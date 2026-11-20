# Error monitoring (Sentry)

Crashes are reported to Sentry so you find out before a user tells you (the admin black screen was found by hand). Everything is **off until you set a DSN**:
tests, development and a missing setting send nothing.

## What is covered
| Part | How | Setting |
| --- | --- | --- |
| Website (Vercel) | `@sentry/react` loaded only when the DSN exists; unhandled errors and promise rejections; the error boundary | Vercel `VITE_SENTRY_DSN` (build time) |
| Android app | the same web code inside the WebView (JavaScript crashes, which is what a black screen is), tagged `android-app` | GitHub variable `VITE_SENTRY_DSN` (the APK workflows pass it) |
| API (Render) | `@sentry/node`; the error handler reports every 5xx with the route pattern | Render `SENTRY_DSN` |

NOT covered: a crash in native Java/Kotlin code (the Android plugins). That needs the native Sentry SDK and a Gradle build; later phase.

## What is sent, what is not
Stack traces, the page path or the route PATTERN (`/songs/:id/related`, never the real URL), the platform (`web`, `android-app`) and the environment.
Never sent: user, email, IP-based identity (`sendDefaultPii` is off), cookies, headers, request bodies, query strings or hash (they hold search words), typed text.
Emails and long tokens inside messages are replaced by `[email]` and `[token]`. Rules and tests: `backend/src/monitoring.js`, `frontend/src/lib/monitoring.js`, `backend/test/monitoring.test.js`, `frontend/src/lib/monitoring.test.js`.
4xx answers are not reported (the caller's mistake). Network noise (aborted requests, `Failed to fetch`, ResizeObserver) is ignored.

## The error boundary
A crash while drawing a screen now shows "Something went wrong" with Reload and Go to Home, not a black page. One boundary wraps each page (the menu and player stay usable),
one wraps the whole app. Both report the crash.

## Set up (once, about 10 minutes, free plan is enough)
1. Create an account at sentry.io, then two projects: **React** (name `tamiltunes-web`, used by the website and the app) and **Node.js** (`tamiltunes-api`).
2. Copy each project's DSN (Settings > Client Keys). A DSN is not a password, but do not paste it in chat or commit it.
3. Render: add `SENTRY_DSN` = the API DSN, then redeploy.
4. Vercel: add `VITE_SENTRY_DSN` = the web DSN for Production, then `vercel --prod` from `frontend/` (not git-connected).
5. GitHub: Settings > Secrets and variables > Actions > Variables: `VITE_SENTRY_DSN` = the web DSN. The next tag build includes it.
6. Check the API: `SENTRY_DSN=... npm run monitoring:check --prefix backend` sends one test error. Check the website: open it, open the browser console and run
   `setTimeout(() => { throw new Error('TamilTunes web monitoring test') })`; it should appear in Sentry within a minute.
7. In Sentry set an alert: "A new issue is created" to your email, and a weekly digest.

## Cost and limits
Free plan: about 5,000 errors a month. A noisy bug can use it up; fix or ignore it in Sentry. Tracing and session replay are off (they cost quota and would see more).
