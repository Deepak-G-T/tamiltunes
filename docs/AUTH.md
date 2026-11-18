# Sign in, sign up and password reset

## What was wrong
Signup and login looked the same account up in the same way (`email.toLowerCase()`) and used the same library (bcryptjs), so a healthy
account is found by both; the "wrong password" answer therefore means the stored hash does not match what was typed (the production row
was checked: a valid `$2b$12$` hash, clean email, no duplicates). Things that made this easy to hit and impossible to recover from:
no password confirmation or show / hide button at signup (a typo is invisible), emails were never trimmed on the server, the unique index
was case-sensitive, and there was no password reset.

## How it works now
- **One helper** (`backend/src/services/auth/credentials.js`): `normalizeEmail` (trim + lower-case), `hashPassword` (bcrypt, cost 12),
  `verifyPassword`. Signup, login, reset, the profile "delete account" check, the seed and the owner scripts all use it. The password is never
  trimmed or changed. New passwords need 8-128 characters.
- **Emails** are normalised by the request schemas before any lookup or save. Migration `20261123000100_email_lower_unique` cleans stored
  emails and adds a unique index on `lower(email)`; if two accounts would collide it changes NOTHING (it prints a notice) so a deploy never
  fails on data: run `npm run report:email-collisions --prefix backend` and decide by hand.
- **Login** answers the same `Invalid email or password` for a wrong email and a wrong password, and does the same amount of work for an
  unknown email. Rate limits: sign in 10 wrong tries per email and 30 per address per 15 minutes (successful sign ins do not count); sign up
  3 per email and 10 per address per hour; forgot password 3 per email per hour and 5 per address per 15 minutes; reset 10 per address per
  15 minutes. Every limit answers `429 Too many attempts. Please try again later.` (nothing about the account).
- **Forgot password** (`POST /api/auth/forgot-password`) always answers `If an account exists, we sent a link`, and does the work after
  answering. The link (`FRONTEND_URL/reset-password?token=...`) holds 32 random bytes; only its SHA-256 is stored
  (`password_reset_tokens`); it expires after 30 minutes, works once, and a newer request closes older links.
  `POST /api/auth/reset-password` sets the new password, signs the person in, and ends every other session (`users.password_changed_at`:
  tokens issued before it are refused).

## Email (set in Render, never in git)
Free Render instances block outbound SMTP, so mail goes over HTTPS:
| Variable | Meaning |
|---|---|
| `EMAIL_PROVIDER` | `brevo` or `resend` (`log` prints the email to the server log, development only) |
| `RESET_EMAIL_FROM` | the sender address (Brevo: a verified sender; Resend: an address on a verified domain) |
| `RESET_EMAIL_FROM_NAME` | optional, default `TamilTunes` |
| `BREVO_API_KEY` / `RESEND_API_KEY` | the provider's API key |
| `FRONTEND_URL` | the Vercel address; links in the email use its first entry |
Until a provider is set, nothing is sent in production (the request still answers normally).

## Owner scripts (run on your computer with `DATABASE_URL` set to the UNPOOLED url, in that shell only)
- `npm run verify-password --prefix backend -- you@example.com`: asks for a password at a hidden prompt and says only "matches" or "does not match". Read only.
- `npm run reset-password --prefix backend -- you@example.com`: asks for the new password twice (hidden) and changes ONLY the password hash
  (and ends other sessions). The account, playlists, favourites and history stay.
- `npm run report:email-collisions --prefix backend`: read only.

## Tests
`backend/test/auth.test.js` (regression: sign up then log in in any email case; reset: expiry, reuse, new request, races, sessions, data
kept; limits; providers; scripts), `frontend/src/lib/authForm.test.js`, `npm run test:auth --prefix frontend` (39 browser checks).

## UNTESTED
A real email from Brevo or Resend (the provider calls are tested against a fake), the Neon migration run, a real phone.
