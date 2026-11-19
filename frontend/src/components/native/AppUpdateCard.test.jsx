import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import AppUpdateCard from './AppUpdateCard';

// In every browser (website and PWA) the card renders nothing and calls no plugin: there window.Capacitor does not exist.
describe('Check for updates card', () => {
  it('is hidden on the website and the PWA', () => {
    expect(globalThis.window?.Capacitor).toBeUndefined();
    expect(renderToString(<AppUpdateCard />)).toBe('');
  });
});
