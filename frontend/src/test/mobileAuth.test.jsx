import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailField, PasswordField, AuthShell } from '../components/auth/AuthParts';
import { SplashLoader } from '../components/auth/LoginGate';

describe('Mobile Auth Input Attributes & Root-Cause Fixes', () => {
  it('EmailField renders mobile-safe autocorrect, autocapitalize and inputmode attributes', () => {
    const html = renderToStaticMarkup(<EmailField value="user@example.com" onChange={() => {}} />);
    expect(html).toContain('type="email"');
    expect(html).toContain('autoCapitalize="off"');
    expect(html).toContain('autoCorrect="off"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('inputMode="email"');
    expect(html).toContain('spellCheck="false"');
  });

  it('PasswordField renders mobile-safe autocorrect, autocapitalize and spellcheck attributes', () => {
    const html = renderToStaticMarkup(<PasswordField value="secret123" onChange={() => {}} />);
    expect(html).toContain('autoCapitalize="off"');
    expect(html).toContain('autoCorrect="off"');
    expect(html).toContain('spellCheck="false"');
    expect(html).toContain('aria-label="Show password"');
  });

  it('shows gentle warning when password has leading or trailing spaces without trimming it', () => {
    const htmlTrailing = renderToStaticMarkup(<PasswordField value="pass " onChange={() => {}} />);
    expect(htmlTrailing).toContain('Your password has a space at the end');

    const htmlLeading = renderToStaticMarkup(<PasswordField value=" pass" onChange={() => {}} />);
    expect(htmlLeading).toContain('Your password has a space at the beginning');

    const htmlBoth = renderToStaticMarkup(<PasswordField value=" pass " onChange={() => {}} />);
    expect(htmlBoth).toContain('Your password has spaces at the beginning and end');

    const htmlClean = renderToStaticMarkup(<PasswordField value="pass" onChange={() => {}} />);
    expect(htmlClean).not.toContain('Your password has a space');
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
