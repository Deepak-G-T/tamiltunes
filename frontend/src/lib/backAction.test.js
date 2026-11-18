import { describe, it, expect } from 'vitest';
import { decideBack, topOverlay } from './backAction';

describe('Android Back button order', () => {
  it('a menu or dialog on top closes first, even over the player', () => expect(decideBack({ overlayOpen: true, fullScreen: true, queueOpen: true, canGoBack: true })).toBe('close-overlay'));
  it('then the full-screen player', () => expect(decideBack({ fullScreen: true, queueOpen: true, canGoBack: true })).toBe('close-player'));
  it('then the queue panel', () => expect(decideBack({ queueOpen: true, canGoBack: true })).toBe('close-queue'));
  it('then one page back', () => expect(decideBack({ canGoBack: true })).toBe('back'));
  it('and only then the app exits', () => { expect(decideBack({})).toBe('exit'); expect(decideBack()).toBe('exit'); });
  it('finds the topmost menu or dialog (the last one in the page)', () => {
    const doc = (els) => ({ querySelectorAll: (sel) => (sel === '[role="menu"], [role="dialog"]' ? els : []) });
    expect(topOverlay(doc([{ id: 'a' }, { id: 'b' }])).id).toBe('b');
    expect(topOverlay(doc([]))).toBeNull();
  });
});
