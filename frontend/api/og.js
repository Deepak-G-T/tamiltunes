// Vercel serverless function. vercel.json routes /u/:username here ONLY for link-preview bots (by User-Agent);
// real visitors get the normal single-page app. Set BACKEND_URL in Vercel if the API host differs.
import { buildOgHtml } from './_ogHtml.js';

export default async function handler(req, res) {
  const username = String(req.query.u || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const backend = (process.env.BACKEND_URL || 'https://tamiltunes-backend.onrender.com').replace(/\/$/, '');
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;

  let profile = null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000); // Render may be waking up; previews degrade to "not found"
    const r = await fetch(`${backend}/api/users/${username}`, { signal: ctl.signal });
    clearTimeout(timer);
    if (r.ok) profile = (await r.json()).profile ?? null;
  } catch { /* fall through to the not-found page */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(profile ? 200 : 404).send(buildOgHtml({ profile, origin, username }));
}
