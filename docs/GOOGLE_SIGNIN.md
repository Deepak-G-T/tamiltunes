# Google-only sign-in, the admin account, and "who is online"

Google is the only way to sign in (website, installed web app and Android app). There is no email + password form, no sign-up, no password reset email.

## How it works
- The browser shows Google's own button (Google Identity Services). The Android app opens Google's account chooser through `@capgo/capacitor-social-login`
  (Google refuses sign-in inside an embedded web view, so the website's button cannot be used in the app).
- Both give an **ID token**. The app sends it to `POST /api/auth/google`. `backend/src/services/auth/googleToken.js` checks it itself, with no extra library:
  RS256 signature against Google's public keys, issuer, **audience = our client ids only**, expiry, and a **verified email**. Anything else is refused (401).
  If `GOOGLE_CLIENT_IDS` is empty nothing is accepted (503 "not set up").
- The server finds the person by Google id, or links an existing account that has the same verified email (their playlists, history and profile stay;
  the old password is removed). A different Google account can never take over an email that is already linked. Then it returns OUR session token, as before.
- Email + password routes (`/auth/register|login|forgot-password|reset-password`) answer `404 GOOGLE_ONLY` in production. Development and the test suite keep them
  (`PASSWORD_AUTH=true|false` overrides). There are no passwords to leak and no reset emails (Brevo is no longer needed).
- Deleting your own account: type your email address (no password).

## The admin
- Admin = the Google account(s) in the Render setting **`ADMIN_EMAILS`** (comma separated, e.g. one address). It is a server setting, not in the repository, and cannot be changed through the app.
  At every sign-in the role follows the list: on the list = admin, off the list = back to a normal user. In production an empty list means nobody is admin.
  A `role = admin` row in the database is not enough: the email must also be on the list (`requireAdmin`).
- Admin screens (Users): who is **online now** (any request in the last 5 minutes, refreshed every 30 s), last seen and last sign-in, an "Online now" filter, the dashboard's
  "Online now" count, **Terminate session** (signs the person out everywhere at once), **Block / Unblock**, **Make admin / Remove admin** (type CONFIRM; the email must already be on ADMIN_EMAILS),
  **Remove account** (deletes the person and everything of theirs; you type their email; never yourself and never an admin). Every one of these is written to the audit log.
- There is no admin password and no TOTP 2FA page any more: protect the admin Google account with Google's own 2-step verification.

## One-time setup in Google Cloud (you do this; client ids are public values, there is no client secret)
1. console.cloud.google.com > create a project (for example "TamilTunes").
2. APIs & Services > OAuth consent screen: User type **External**, app name TamilTunes, your support email, scopes email/profile/openid only. Then **Publish app** to Production
   (basic scopes need no Google review). While it stays in "Testing" only the listed test users can sign in.
3. APIs & Services > Credentials > Create credentials > OAuth client ID:
   - **Web application**: Authorised JavaScript origins `https://frontend-eosin-five-11.vercel.app` (add your own domain later) and `http://localhost:5173` for development. This is the id the server checks.
   - **Android**: package name `com.tamiltunes.app` and the **SHA-1 of the signing key** (see below). Its id is never put in the app; Google just needs it to exist.
4. Set the settings (Render and Vercel dashboards, never in the repository):
   - Render: `GOOGLE_CLIENT_IDS` = the Web client id; `ADMIN_EMAILS` = your Google address. Then redeploy.
   - Vercel: `VITE_GOOGLE_CLIENT_ID` = the same Web client id. Then run the frontend deploy (the site is not connected to git).
   - The Android app is built in CI: add `VITE_GOOGLE_CLIENT_ID` as a GitHub **variable** (Settings > Secrets and variables > Actions > Variables) so the APK build can read it, see `android-debug.yml` / `android-release.yml`.

## The Android signing key and Google
Google checks the app's signing key (SHA-1) for native sign-in. CI debug builds used a different throw-away key each time, so they would be refused. Fix: set the four release-key secrets
(`docs/APP_UPDATES.md`); both the debug and the release workflows then sign with that ONE key, and one Android client in Google Cloud covers every build. Get the SHA-1:
```
keytool -list -v -keystore tamiltunes-release.jks -alias tamiltunes
```
(copy the "SHA1:" line into the Android OAuth client). Without the secrets, a debug APK cannot sign in (the app says "Google sign-in is not set up for this version of the app yet").

## Existing accounts and what is NOT possible any more
- A person with an old email + password account signs in with the Google account that has the **same email** and keeps everything. An old account whose email is not a Google account cannot be reached.
- Migration `20261127000000_google_signin` (additive): `users.password` becomes optional, new `google_sub` (unique), `last_seen_at`, `last_login_at`. Take the Neon backup branch BEFORE merging.
- UNTESTED: the real Google button, the real Android account chooser, the real Google Cloud set-up, Render/Vercel with the new settings.
