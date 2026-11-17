/**
 * HTML for link-preview crawlers (WhatsApp, Telegram, Slack, X, Facebook...). They don't run JavaScript,
 * so the single-page app can't supply per-profile Open Graph tags itself. Pure + escaped so it is unit-testable.
 */
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {{ profile: { name: string, username: string, bio?: string|null, isPrivate?: boolean, avatarUrl?: string|null } | null,
 *   origin: string, username: string }} input
 */
export function buildOgHtml({ profile, origin, username }) {
  if (!profile) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>User not found · TamilTunes</title></head><body><p>User not found.</p></body></html>`;
  }
  const url = `${origin}/u/${encodeURIComponent(profile.username || username)}`;
  const title = `${profile.name} (@${profile.username}) · TamilTunes`;
  const description = profile.isPrivate
    ? 'This profile is private.'
    : (profile.bio || `${profile.name} on TamilTunes: ad-free Tamil music streaming.`).slice(0, 200);
  const image = profile.avatarUrl ? `${origin}/api${profile.avatarUrl}` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="TamilTunes">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n` : ''}<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
</head><body><h1>${esc(profile.name)}</h1><p>${esc(description)}</p><a href="${esc(url)}">Open on TamilTunes</a></body></html>`;
}
