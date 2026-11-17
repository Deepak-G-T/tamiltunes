import { describe, it, expect } from 'vitest';
import { buildOgHtml, esc } from '../../api/_ogHtml.js';

describe('link preview HTML', () => {
  it('escapes user-controlled text', () => {
    expect(esc('<script>"x"&\'</script>')).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;&lt;/script&gt;');
    const html = buildOgHtml({ profile: { name: '"><script>alert(1)</script>', username: 'ab_c', bio: '<img src=x onerror=1>' }, origin: 'https://x.app', username: 'ab_c' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });
  it('includes Open Graph tags and an absolute avatar URL', () => {
    const html = buildOgHtml({ profile: { name: 'Aarav', username: 'aarav', bio: 'Melody lover', avatarUrl: '/users/aarav/avatar?v=1' }, origin: 'https://x.app', username: 'aarav' });
    expect(html).toContain('<meta property="og:title" content="Aarav (@aarav) · TamilTunes">');
    expect(html).toContain('<meta property="og:image" content="https://x.app/api/users/aarav/avatar?v=1">');
    expect(html).toContain('og:url" content="https://x.app/u/aarav"');
  });
  it('hides the bio of private profiles and handles unknown users', () => {
    const html = buildOgHtml({ profile: { name: 'P', username: 'p_1', bio: 'secret', isPrivate: true }, origin: 'https://x.app', username: 'p_1' });
    expect(html).not.toContain('secret');
    expect(buildOgHtml({ profile: null, origin: 'https://x.app', username: 'zz' })).toContain('noindex');
  });
});
