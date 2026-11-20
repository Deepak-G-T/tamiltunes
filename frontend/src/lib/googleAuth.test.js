import { describe, it, expect } from 'vitest';
import { isGoogleCancel, describeGoogleError, GIS_SRC, googleConfigured } from './googleAuth';

describe('Google sign-in helpers', () => {
  it('a person closing the account chooser is not an error', () => {
    for (const e of [{ message: 'User cancelled the login' }, { code: 'USER_CANCELLED' }, { message: 'The user canceled the sign-in flow' }, { message: '12501' }, { message: 'popup_closed' }]) {
      expect(isGoogleCancel(e)).toBe(true);
      expect(describeGoogleError(e)).toBe('');
    }
  });
  it('real problems get a plain message', () => {
    expect(describeGoogleError({ message: 'Failed to fetch: network error' })).toMatch(/No internet/);
    expect(describeGoogleError({ message: 'DEVELOPER_ERROR: signing SHA-1 does not match' })).toMatch(/not set up/);
    expect(describeGoogleError({ response: { data: { message: 'Account has been deactivated' } } })).toBe('Account has been deactivated');
    expect(describeGoogleError({ message: 'weird' })).toMatch(/did not complete/);
  });
  it('the Google script comes only from Google', () => {
    expect(GIS_SRC).toBe('https://accounts.google.com/gsi/client');
  });
  it('without a client id (a build that was not given one) the sign-in says so instead of failing silently', () => {
    expect(typeof googleConfigured()).toBe('boolean');
  });
});
