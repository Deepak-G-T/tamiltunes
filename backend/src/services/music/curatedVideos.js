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
 * (songIds are the yt_* ids of the fix/youtube-feed YouTube provider; JioSaavn songs match by title + artist.)
 */
export const VERIFICATION_NOTE = 'oEmbed-verified by a previous agent, embeddability unverified';

export const CURATED_VIDEOS = [
  { videoId: 'IqwIOlhfCak', songId: 'yt_badass_leo', titles: ['badass', 'badass leo'], artistHints: ['anirudh'], label: 'Badass (Leo)' },
  // Hukum: two conflicting IDs. fix/youtube-feed's own yt_hukum_jailer record uses 1F3hm6MfR1k (the id supplied
  // by the owner), so that one is served. The older repo id 1F3HM635S0k is kept as an unserved candidate.
  { videoId: '1F3hm6MfR1k', songId: 'yt_hukum_jailer', titles: ['hukum', 'hukum thalaivar alappara'], artistHints: ['anirudh'], label: 'Hukum (Jailer)', note: 'matches fix/youtube-feed record' },
  { videoId: '1F3HM635S0k', titles: ['hukum', 'hukum thalaivar alappara'], artistHints: ['anirudh'], label: 'Hukum (Jailer)', candidate: true, note: 'CONFLICTS with 1F3hm6MfR1k (older repo id); owner to confirm manually' },
  { videoId: 'szvt1vD0Uug', songId: 'yt_naa_ready', titles: ['naa ready'], artistHints: ['anirudh', 'vijay'], label: 'Naa Ready' },
  { videoId: 'fRD_3vJagxk', songId: 'yt_vaathi_coming', titles: ['vaathi coming'], artistHints: ['anirudh'], label: 'Vaathi Coming' },
  { videoId: 'xsbLtHql4g8', songId: 'yt_aalaporaan_thamizhan', titles: ['aalaporaan thamizhan'], artistHints: ['rahman', 'vijay'], label: 'Aalaporaan Thamizhan (Mersal)' },
  { videoId: 'KUN5Uf9mObQ', songId: 'yt_arabic_kuthu', titles: ['arabic kuthu', 'halamithi habibo'], artistHints: ['anirudh', 'jonita'], label: 'Arabic Kuthu (Beast)' },
  { videoId: 'RVLNBVK8auM', songId: 'yt_kaavaalaa', titles: ['kaavaalaa', 'kaavaalaa nee kaavaalaa'], artistHints: ['anirudh', 'shilpa'], label: 'Kaavaalaa (Jailer)' },
  { videoId: 'x6Q7c9RyMzk', songId: 'yt_rowdy_baby', titles: ['rowdy baby'], artistHints: ['dhanush', 'dhee', 'yuvan'], label: 'Rowdy Baby (Maari 2)' },
  { videoId: 'YR12Z8f1Dh8', songId: 'yt_kolaveri_di', titles: ['why this kolaveri di'], artistHints: ['dhanush', 'anirudh'], label: 'Why This Kolaveri Di' }
].map((e) => ({ status: VERIFICATION_NOTE, ...e }));
