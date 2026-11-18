import { describe, it, expect } from 'vitest';
import { decideBack, topOverlay } from './backAction';

describe('Android Back button order', () => {
  it('a menu or dialog on top closes first, even over the player', () => expect(decideBack({ overlayOpen: true, fullScreen: true, queueOpen: true, canGoBack: true })).toBe('close-overlay'));
  it('then the full-screen player', () => expect(decideBack({ fullScreen: true, queueOpen: true, canGoBack: true })).toBe('close-player'));
  it('then the queue panel', () => expect(decideBack({ queueOpen: true, canGoBack: true })).toBe('close-queue'));
  it('then one page back', () => expect(decideBack({ canGoBack: true })).toBe('back'));
  it('and only then the app exits', () => { expect(decideBack({})).toBe('exit'); expect(decideBack()).toBe('exit'); });
  describe('which element gets the Escape', () => {
    const el = (id, insideDialog = false) => ({ id, closest: (sel) => (sel === '[role="dialog"]' && insideDialog ? {} : null) });
    const doc = ({ menus = [], dialogs = [] }) => ({ querySelectorAll: (sel) => (sel === '[role="menu"]' ? menus : sel === '[role="dialog"]' ? dialogs : []) });
    it('the last dialog', () => expect(topOverlay(doc({ dialogs: [el('a'), el('b')] })).id).toBe('b'));
    it('a menu inside a dialog is not the target: the dialog is', () => expect(topOverlay(doc({ menus: [el('m', true)], dialogs: [el('d')] })).id).toBe('d'));
    it('a menu that stands alone is on top of everything', () => expect(topOverlay(doc({ menus: [el('m', false)], dialogs: [el('d')] })).id).toBe('m'));
    it('nothing open', () => expect(topOverlay(doc({}))).toBeNull());
  });
});
