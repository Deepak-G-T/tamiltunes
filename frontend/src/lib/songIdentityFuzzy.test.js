import { describe, it, expect } from 'vitest';
import { isSameSong, sameVariant, phoneticText, transliterateTamil, titleSimilarity, isCompilation, pickBest, clusterSongs, collapseDuplicates, createIdentitySet } from './songIdentity';

// Fixtures from real mobile screenshots (ids, albums and durations as seen there).
const S = (id, title, artist, album, duration, extra = {}) => ({ id, title, artist, singers: artist, album, duration, ...extra });
const konjam1 = S('k1', 'Innum Konjam Neram', 'Vijay Prakash, Shreya Ghoshal', 'Maryan', 313);
const konjam2 = S('k2', 'Innum Konjam Neram', 'Vijay Prakash', 'A.R. Rahman Romantic Hits', 313);
const nanun1 = S('n1', 'Naan Un (From "24")', 'Arijit Singh, Chinmayi', 'A.R. Rahman Romantic Hits', 288, { composer: 'A.R. Rahman' });
const nanun2 = S('n2', 'Naan Un (From "24")', 'Arijit Singh', 'Konjam Paatu Konjam Kaadhal', 288);
const annul1 = S('a1', 'Annul Maelae', 'Pradeep Kumar', 'Aadhavan', 322);
const annul2 = S('a2', 'Annul Melae', 'Pradeep Kumar', 'Aadhavan', 322);

describe('fuzzy duplicates (the three screenshots)', () => {
  it('same title, different ids and compilation album', () => expect(isSameSong(konjam1, konjam2)).toBe(true));
  it('Naan Un (From "24") twice, 4:48, different albums and covers', () => expect(isSameSong(nanun1, nanun2)).toBe(true));
  it('Annul Maelae / Annul Melae, 5:22', () => expect(isSameSong(annul1, annul2)).toBe(true));
  it('durations within 2 seconds still match, 3 seconds do not', () => {
    expect(isSameSong(annul1, { ...annul2, duration: 324 })).toBe(true);
    expect(isSameSong(annul1, { ...annul2, duration: 325 })).toBe(false);
  });
  it('a missing duration needs a closer title', () => {
    expect(isSameSong(annul1, { ...annul2, duration: 0 })).toBe(true); // sounds identical
    expect(isSameSong(S('x', 'Kannana Kanne', 'A', 'F', 300), S('y', 'Kannaana Kane Kane', 'A', 'F', 0))).toBe(false);
  });
  it('the composer counts as a shared artist', () => {
    expect(isSameSong(S('1', 'Vaa Vaa', 'Singer One', 'X', 250, { composer: 'Anirudh' }), S('2', 'Vaa Vaa', 'Singer Two', 'Y', 250, { composer: 'Anirudh Ravichander' }))).toBe(true); // a fuller spelling of the same name
    expect(isSameSong(S('1', 'Vaa Vaa', 'Singer One', 'X', 250, { composer: 'Anirudh' }), S('2', 'Vaa Vaa', 'Singer Two', 'Y', 250, { composer: 'Anirudh' }))).toBe(true);
  });
  it('different composers and singers do not match', () => {
    expect(isSameSong(S('1', 'Vaa Vaa', 'Singer One', 'X', 250, { composer: 'Anirudh' }), S('2', 'Vaa Vaa', 'Singer Two', 'Y', 250, { composer: 'Harris Jayaraj' }))).toBe(false);
  });
  it('a strong key (ISRC) settles it whatever the title says', () => {
    expect(isSameSong(S('1', 'One', 'A', 'X', 100, { isrc: 'INA0000001' }), S('2', 'Totally Other', 'B', 'Y', 400, { isrc: 'ina-0000-001' }))).toBe(true);
  });
});

describe('what must NOT merge', () => {
  it('Pavazha Malli vs Pavazha Malli Unplugged (version words, another length)', () => {
    const a = S('p1', 'Pavazha Malli', 'Sam CS', 'Think Indie', 235);
    const b = S('p2', 'Pavazha Malli (Unplugged)', 'Sam CS', 'Think Indie', 198);
    expect(isSameSong(a, b)).toBe(false);
    expect(isSameSong(a, { ...b, duration: 235 })).toBe(false); // even with the same length: a different version
    expect(sameVariant(a, b)).toBe(true); // variant rules still keep them out of one radio block
  });
  it('two different songs by one artist with the same duration', () => {
    expect(isSameSong(S('1', 'Kadhal Sadugudu', 'A.R. Rahman', 'Alai Payuthey', 270), S('2', 'Mathura Marikozhundhu', 'A.R. Rahman', 'Alai Payuthey', 270))).toBe(false);
    expect(isSameSong(S('3', 'Vaseegara', 'Bombay Jayashri', 'Minnale', 300), S('4', 'Vaseegara Kadhal', 'Bombay Jayashri', 'Minnale', 300))).toBe(false);
  });
  it('numbered parts and different artists', () => {
    expect(isSameSong(S('1', 'Theme Part 1', 'A', 'F', 200), S('2', 'Theme Part 2', 'A', 'F', 200))).toBe(false);
    expect(isSameSong(S('1', 'Kadhal', 'Artist One', 'F', 200), S('2', 'Kadhal', 'Artist Two', 'G', 200))).toBe(false);
  });
});

describe('phonetic Tanglish', () => {
  it('collapses spelling variants', () => {
    expect(phoneticText('Annul Maelae')).toBe(phoneticText('Annul Melae'));
    expect(phoneticText('Kaadhal')).toBe(phoneticText('Kathal'));
  });
  it('th/dh, aa, ee/ii, oo/uu, zh', () => {
    expect(phoneticText('Thalapathy')).toBe(phoneticText('Talapati'));
    expect(phoneticText('Kuuttam')).toBe(phoneticText('Kuttam'));
    expect(phoneticText('Pavazha')).toBe(phoneticText('Pavala'));
    expect(phoneticText('Neenga')).toBe(phoneticText('Ninga'));
  });
  it('Tamil script is transliterated', () => {
    expect(transliterateTamil('காதல்')).toBe('kaathal');
    expect(titleSimilarity({ title: 'காதல்' }, { title: 'Kadhal' })).toBeGreaterThan(0.85);
  });
});

describe('versions and canonical groups', () => {
  it('compilations are low priority', () => {
    expect(isCompilation(konjam2)).toBe(true);
    expect(isCompilation(konjam1)).toBe(false);
    expect(pickBest([konjam2, konjam1]).id).toBe('k1');
    expect(pickBest([nanun1, { ...nanun2, album: '24', playCount: 5 }]).id).toBe('n2');
  });
  it('then the highest play count, then the better source', () => {
    expect(pickBest([{ ...annul1, playCount: 10 }, { ...annul2, playCount: 99 }]).id).toBe('a2');
    expect(pickBest([{ ...annul1, streamUrl: null, isPlayable: false }, { ...annul2, streamUrl: 'u' }]).id).toBe('a2');
  });
  it('clusterSongs gives every copy the id of the best one', () => {
    const { groups, canonicalOf } = clusterSongs([konjam2, nanun1, annul2, konjam1, nanun2, annul1]);
    expect(groups).toHaveLength(3);
    expect(canonicalOf.get('k2')).toBe('k1');
    expect(canonicalOf.get('n1')).toBe(canonicalOf.get('n2'));
    expect(canonicalOf.get('a1')).toBe(canonicalOf.get('a2'));
  });
  it('collapseDuplicates keeps one, the best, in first-seen order', () => {
    expect(collapseDuplicates([konjam2, annul1, konjam1, annul2]).map((s) => s.id)).toEqual(['k1', 'a1']);
  });
  it('createIdentitySet matches fuzzy twins', () => {
    const set = createIdentitySet([annul1]);
    expect(set.has(annul2)).toBe(true);
    expect(set.has(S('z', 'Something Else', 'Pradeep Kumar', 'Aadhavan', 322))).toBe(false);
  });
});
