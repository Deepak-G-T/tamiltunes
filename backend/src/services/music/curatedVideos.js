/**
 * Curated song -> YouTube video map. Edit this file by hand.
 *
 * status: every entry below is "oEmbed-verified by a previous agent, embeddability unverified"
 * (that claim comes from the project owner; this code did NOT re-verify it, and a video can be
 * oEmbed-visible yet still refuse embedding, which the player reports as error 101/150).
 *
 * Matching: a song matches when its normalized title equals one of `titles` AND its artist/singer
 * text contains one of `artistHints` (case-insensitive). `songId` additionally matches exact ids.
 * `candidate: true` entries are NOT served; they are kept for the owner to confirm manually.
 */
export const VERIFICATION_NOTE = 'oEmbed-verified by a previous agent, embeddability unverified';

export const CURATED_VIDEOS = [
  { videoId: 'IqwIOlhfCak', songId: 'yt_badass_leo', titles: ['badass', 'badass leo'], artistHints: ['anirudh'], label: 'Badass (Leo)' },
  // Hukum: two conflicting IDs. The first is the one already used by the repo's yt_hukum_jailer
  // record, so it resolves. The second is the owner-supplied one, kept as an unserved candidate.
  { videoId: '1F3HM635S0k', songId: 'yt_hukum_jailer', titles: ['hukum', 'hukum thalaivar alappara'], artistHints: ['anirudh'], label: 'Hukum (Jailer)', note: 'repo-existing id' },
  { videoId: '1F3hm6MfR1k', titles: ['hukum', 'hukum thalaivar alappara'], artistHints: ['anirudh'], label: 'Hukum (Jailer)', candidate: true, note: 'CONFLICTS with 1F3HM635S0k; owner to confirm manually' },
  { videoId: 'szvt1vD0Uug', songId: 'yt_naa_ready', titles: ['naa ready'], artistHints: ['anirudh', 'vijay'], label: 'Naa Ready' },
  { videoId: 'fRD_3vJagxk', songId: 'yt_vaathi_coming', titles: ['vaathi coming'], artistHints: ['anirudh'], label: 'Vaathi Coming' },
  { videoId: 'xsbLtHql4g8', songId: 'yt_aalaporaan_thamizhan', titles: ['aalaporaan thamizhan'], artistHints: ['rahman', 'vijay'], label: 'Aalaporaan Thamizhan (Mersal)' },
  { videoId: 'KUN5Uf9mObQ', titles: ['arabic kuthu', 'halamithi habibo'], artistHints: ['anirudh', 'jonita'], label: 'Arabic Kuthu (Beast)' },
  { videoId: 'RVLNBVK8auM', titles: ['kaavaalaa', 'kaavaalaa nee kaavaalaa'], artistHints: ['anirudh', 'shilpa'], label: 'Kaavaalaa (Jailer)' },
  { videoId: 'x6Q7c9RyMzk', titles: ['rowdy baby'], artistHints: ['dhanush', 'dhee', 'yuvan'], label: 'Rowdy Baby (Maari 2)' },
  { videoId: 'YR12Z8f1Dh8', titles: ['why this kolaveri di'], artistHints: ['dhanush', 'anirudh'], label: 'Why This Kolaveri Di' }
].map((e) => ({ status: VERIFICATION_NOTE, ...e }));
