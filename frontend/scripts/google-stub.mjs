// Shared by the browser audits: a fake Google. The page is told a (made-up) client id through the test hook, Google's script is replaced with a stub
// whose button hands the app an ID token when clicked, and nothing ever reaches Google. It says nothing about the real Google button.
export const TEST_CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
const STUB = `
window.google = { accounts: { id: {
  initialize(o) { window.__gsiCallback = o.callback; window.__gsiInit = o; },
  renderButton(el, opts) {
    window.__gsiButtonOpts = opts;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Continue with Google (test)'; b.setAttribute('data-testid', 'fake-google');
    b.style.cssText = 'min-height:44px;min-width:200px;padding:0 16px;border-radius:999px';
    b.onclick = () => window.__gsiCallback({ credential: window.__TT_ID_TOKEN || 'TEST_GOOGLE_ID_TOKEN_0123456789' });
    el.appendChild(b);
  }
} } };`;
export async function installGoogleStub(context, { clientId = TEST_CLIENT_ID } = {}) {
  await context.addInitScript((id) => { window.__TT_GOOGLE_CLIENT_ID = id; }, clientId);
  await context.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'application/javascript', body: STUB }));
}
