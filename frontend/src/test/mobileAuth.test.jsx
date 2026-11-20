import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthShell, FormError } from '../components/auth/AuthParts';
import { SplashLoader } from '../components/auth/LoginGate';

describe('Sign-in screen parts', () => {
  it('the shell shows the title, the subtitle, its content and the footer', () => {
    const html = renderToStaticMarkup(<AuthShell title="Sign in to TamilTunes" subtitle="With Google" footer={<span>footer text</span>}><p>content</p></AuthShell>);
    expect(html).toContain('Sign in to TamilTunes');
    expect(html).toContain('With Google');
    expect(html).toContain('content');
    expect(html).toContain('footer text');
  });
  it('an error is announced to screen readers, and nothing is drawn without one', () => {
    expect(renderToStaticMarkup(<FormError>Account has been deactivated</FormError>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<FormError>{''}</FormError>)).toBe('');
  });
});

describe('Login-First Gate Guard', () => {
  it('SplashLoader renders dark #09090B splash screen without Home flash', () => {
    const html = renderToStaticMarkup(<SplashLoader />);
    expect(html).toContain('bg-[#09090B]');
    expect(html).toContain('data-testid="gate-splash-loader"');
    expect(html).toContain('TamilTunes');
    expect(html).toContain('Checking session...');
  });
});
