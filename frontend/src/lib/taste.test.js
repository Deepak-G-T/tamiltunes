import { describe, it, expect } from 'vitest';
import { toggleChoice, picksPayload, totalPicks, shouldOpenPicker, STEPS, RECOMMENDED } from './taste';

const options = { artists: ['Sid Sriram', 'Chinmayi', 'Karthik'], composers: ['Ilaiyaraaja', 'A. R. Rahman'], eras: [{ id: '90s', label: '90s' }, { id: '2000s', label: '2000s' }] };

describe('picker choices', () => {
  it('adds and removes a choice', () => {
    let r = toggleChoice([], 'Sid Sriram', 3);
    expect(r).toEqual({ list: ['Sid Sriram'], atLimit: false });
    r = toggleChoice(r.list, 'Chinmayi', 3);
    r = toggleChoice(r.list, 'Sid Sriram', 3);
    expect(r.list).toEqual(['Chinmayi']);
  });
  it('stops at the limit and says so', () => {
    const full = toggleChoice(['a', 'b'], 'c', 3);
    expect(full).toEqual({ list: ['a', 'b', 'c'], atLimit: true });
    const over = toggleChoice(full.list, 'd', 3);
    expect(over.list).toEqual(['a', 'b', 'c']);
    expect(over.atLimit).toBe(true);
    expect(toggleChoice(full.list, 'a', 3).list).toEqual(['b', 'c']); // a full list can still remove
  });
  it('saves only what the server offered', () => {
    expect(picksPayload({ artists: ['Sid Sriram', 'Gone Singer'], composers: ['Ilaiyaraaja'], eras: ['90s', '1850s'] }, options)).toEqual({ artists: ['Sid Sriram'], composers: ['Ilaiyaraaja'], eras: ['90s'] });
    expect(picksPayload({}, options)).toEqual({ artists: [], composers: [], eras: [] });
    expect(totalPicks({ artists: ['a'], composers: ['b', 'c'], eras: [] })).toBe(3);
    expect(totalPicks({})).toBe(0);
  });
  it('three steps in order', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['artists', 'composers', 'eras']);
    expect(RECOMMENDED).toBe(3);
  });
});

describe('when the picker opens by itself', () => {
  const base = { shouldOnboard: true, pathname: '/', askedThisSession: false };
  it('opens for a new account, once per session', () => {
    expect(shouldOpenPicker(base)).toBe(true);
    expect(shouldOpenPicker({ ...base, askedThisSession: true })).toBe(false);
  });
  it('never when the server says no, or while already there', () => {
    expect(shouldOpenPicker({ ...base, shouldOnboard: false })).toBe(false);
    expect(shouldOpenPicker({ ...base, pathname: '/welcome' })).toBe(false);
    expect(shouldOpenPicker({ ...base, pathname: '/wrapped' })).toBe(false);
    expect(shouldOpenPicker({ ...base, shouldOnboard: undefined })).toBe(false);
  });
});
