/**
 * Sends the password reset email. Providers (set EMAIL_PROVIDER):
 *   brevo   Brevo HTTPS API   needs BREVO_API_KEY and RESET_EMAIL_FROM (an address verified in Brevo)
 *   resend  Resend HTTPS API  needs RESEND_API_KEY and RESET_EMAIL_FROM (an address on a domain verified in Resend)
 *   log     (default outside production) prints the email to the server log instead of sending it
 * They use HTTPS, not SMTP: free Render instances block outbound SMTP ports. No secret is ever committed or logged.
 */
const trimSlash = (s) => String(s || '').trim().replace(/\/+$/, '');

/** The web app's address for links in emails: FRONTEND_URL (first one if several), else CORS_ORIGIN, else local dev. */
export function frontendBase(env = process.env) {
  const first = (v) => trimSlash(String(v || '').split(',')[0]);
  return first(env.FRONTEND_URL) || first(env.CORS_ORIGIN) || 'http://localhost:3000';
}

export const resetLink = (token, env = process.env) => `${frontendBase(env)}/reset-password?token=${encodeURIComponent(token)}`;

export function resetEmail({ link, minutes = 30 }) {
  const subject = 'Reset your TamilTunes password';
  const text = `Hi,\n\nSomeone asked to reset the password for your TamilTunes account. Open this link to choose a new password (it works once and expires in ${minutes} minutes):\n\n${link}\n\nIf you did not ask for this, you can ignore this email. Your password stays the same.\n\nTamilTunes`;
  const html = `<p>Hi,</p><p>Someone asked to reset the password for your TamilTunes account. Use the button below to choose a new password. The link works once and expires in ${minutes} minutes.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1db954;color:#000;border-radius:24px;text-decoration:none;font-weight:bold">Choose a new password</a></p><p>Or paste this address into your browser:<br>${link}</p><p>If you did not ask for this, you can ignore this email. Your password stays the same.</p><p>TamilTunes</p>`;
  return { subject, text, html };
}

export function createEmailSender({ env = process.env, fetchImpl = globalThis.fetch, logger = console } = {}) {
  const provider = (env.EMAIL_PROVIDER || (env.NODE_ENV === 'production' ? '' : 'log')).toLowerCase();
  const from = env.RESET_EMAIL_FROM || '';
  const fromName = env.RESET_EMAIL_FROM_NAME || 'TamilTunes';
  const outbox = []; // what was "sent" in log mode, for tests

  async function post(url, headers, body) {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`email provider answered ${res.status}`); // never include the response or the key
  }

  return {
    provider,
    outbox,
    isConfigured: () => provider === 'log' || ((provider === 'brevo' && env.BREVO_API_KEY && from) || (provider === 'resend' && env.RESEND_API_KEY && from) ? true : false),
    async send({ to, subject, text, html }) {
      if (provider === 'brevo') {
        return post('https://api.brevo.com/v3/smtp/email', { 'api-key': env.BREVO_API_KEY }, { sender: { email: from, name: fromName }, to: [{ email: to }], subject, textContent: text, htmlContent: html });
      }
      if (provider === 'resend') {
        return post('https://api.resend.com/emails', { Authorization: `Bearer ${env.RESEND_API_KEY}` }, { from: `${fromName} <${from}>`, to: [to], subject, text, html });
      }
      outbox.push({ to, subject, text });
      if (env.NODE_ENV !== 'production') logger.info?.(`[email:log] to ${to}: ${subject}\n${text}`);
      return undefined;
    },
  };
}
