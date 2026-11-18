import { describe, it, expect } from 'vitest';
import { songFingerprint, variantKey, sameSong, sameVariant, createIdentitySet, titleCore, variantCore, movieOf, primaryArtist } from './songIdentity';

const pm = (extra = {}) => ({ id: 'a', title: 'Pavazha Malli (From "Think Indie")', album: 'Think Indie', singers: 'Sam CS, Pragathi Guruprasad', artist: 'Sam CS', ...extra });

describe('same song: different id, cover or singer order', () => {
  it('the title loses bracketed text, "- From ..." and "[Official]"', () => {
    expect(titleCore(pm())).toBe('pavazha malli');
    expect(titleCore({ title: 'Pavazha Malli - From "Think Indie"' })).toBe('pavazha malli');
    expect(titleCore({ title: 'Pavazha Malli [Official]' })).toBe('pavazha malli');
    expect(titleCore({ title: 'Pavazha   Malli!!' })).toBe('pavazha malli');
  });
  it('the singers in another order give the same fingerprint', () => {
    const a = pm();
    const b = pm({ id: 'zzz', image: 'other-cover.jpg', singers: 'Pragathi Guruprasad, Sam CS' });
    expect(songFingerprint(a)).toBe(songFingerprint(b));
    expect(sameSong(a, b)).toBe(true);
  });
  it('ids and covers do not matter, unicode forms do not matter', () => {
    expect(sameSong(pm(), pm({ id: 'other', image: 'x' }))).toBe(true);
    expect(songFingerprint({ title: 'ｐａｖａｚｈａ malli', singers: 'A' })).toBe(songFingerprint({ title: 'pavazha malli', singers: 'A' }));
  });
  it('a different film and different singers is a different song with the same title', () => {
    expect(sameSong(pm(), pm({ id: 'x', album: 'Another Film', singers: 'Someone Else' }))).toBe(false);
  });
  it('a missing film or singer list does not make two copies different', () => {
    expect(sameSong(pm(), pm({ id: 'x', album: '', singers: '' }))).toBe(true);
  });
  it('Tamil titles work too', () => {
    const a = { id: '1', title: 'பவழ மல்லி (From "திங்க் இண்டி")', singers: 'சாம் சிஎஸ், பிரகதி' };
    const b = { id: '2', title: 'பவழ மல்லி', singers: 'பிரகதி, சாம் சிஎஸ்' };
    expect(sameSong(a, b)).toBe(true);
  });
  it('the film name is cleaned', () => {
    expect(movieOf({ album: 'Leo (Original Motion Picture Soundtrack)' })).toBe('leo');
    expect(primaryArtist({ singers: 'Sid Sriram, X' })).toBe('sid sriram');
  });
});

describe('versions of a song', () => {
  const unplugged = pm({ id: 'u', title: 'Pavazha Malli Unplugged (From "Think Indie")' });
  it('"Unplugged" is a different song but the same variant', () => {
    expect(sameSong(pm(), unplugged)).toBe(false);
    expect(variantKey(pm())).toBe(variantKey(unplugged));
    expect(sameVariant(pm(), unplugged)).toBe(true);
  });
  it('every version word is stripped from the variant key', () => {
    for (const w of ['Unplugged', 'Acoustic', 'Remix', 'Reprise', 'Lofi', 'Lo-Fi', 'Slowed', 'Reverb', 'Instrumental', 'Karaoke', 'Cover', '8D', 'Male Version', 'Female Version', 'Slowed and Reverb']) {
      expect(variantCore({ title: `Pavazha Malli ${w}` }), w).toBe('pavazha malli');
      expect(variantCore({ title: `Pavazha Malli (${w} Version)` }), w).toBe('pavazha malli');
    }
  });
  it('a version word inside a bracket still counts as a version of the song', () => {
    expect(sameSong(pm(), pm({ id: 'x', title: 'Pavazha Malli (Unplugged)' }))).toBe(false);
    expect(sameVariant(pm(), pm({ id: 'x', title: 'Pavazha Malli (Unplugged)' }))).toBe(true);
  });
  it('words that merely contain a version word are not stripped', () => {
    expect(variantCore({ title: 'Discover Me' })).toBe('discover me');
    expect(variantCore({ title: 'Recover' })).toBe('recover');
  });
  it('another song is not a variant', () => {
    expect(sameVariant(pm(), pm({ id: 'x', title: 'Veezha Veera', album: 'Other', singers: 'Q' }))).toBe(false);
  });
  it('the set finds the same song and its versions', () => {
    const set = createIdentitySet([pm()]);
    expect(set.has(pm({ id: 'new', singers: 'Pragathi Guruprasad, Sam CS' }))).toBe(true);
    expect(set.has(unplugged)).toBe(false);
    expect(set.hasVariant(unplugged)).toBe(true);
    expect(set.hasVariant(pm({ id: 'q', title: 'Something Else', album: 'X', singers: 'Y' }))).toBe(false);
    expect(set.size).toBeUndefined();
  });
});
