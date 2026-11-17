/**
 * Curated song -> YouTube video map. Edit this file by hand.
 * Entries marked candidate are never served. Served entries without their own `status` carry the default note below.
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

// Found by web search: the YouTube title says "Video Song" / "Official Video" (not "Lyric"). The uploader and
// embeddability were NOT checked, and a wrong id could show the wrong video, so verify each on a phone.
const SEARCH_NOTE = 'found by web search, title says Video Song; uploader and embeddability unverified';

export const CURATED_VIDEOS = [
  // Badass: no explicit "video song" id found yet. Candidate "Leo - Badass Video" = ZdMZ40GSVmc (title does not say
  // Video Song; owner to check). The current id is kept until confirmed.
  { videoId: 'IqwIOlhfCak', songId: 'yt_badass_leo', titles: ['badass', 'badass leo'], artistHints: ['anirudh'], label: 'Badass (Leo)' },

  // Hukum: video song served. 1F3hm6MfR1k is titled "JAILER - Hukum Lyric Video"; 1F3HM635S0k is an older id.
  { videoId: 'gB2zKZxESTg', songId: 'yt_hukum_jailer', titles: ['hukum', 'hukum thalaivar alappara'], artistHints: ['anirudh'], label: 'Hukum (Jailer)', status: SEARCH_NOTE },
  { videoId: '1F3hm6MfR1k', titles: ['hukum', 'hukum thalaivar alappara'], artistHints: ['anirudh'], label: 'Hukum (Jailer)', candidate: true, note: 'titled "JAILER - Hukum Lyric Video": lyric video, not served' },
  { videoId: '1F3HM635S0k', titles: ['hukum', 'hukum thalaivar alappara'], artistHints: ['anirudh'], label: 'Hukum (Jailer)', candidate: true, note: 'older repo id, unconfirmed, not served' },

  // Naa Ready: "LEO - Naa Ready 8K/4K Video Song". Another upload, tbOi9ZPAkcc "LEO - Naa Ready Song Video", is a possible alternative.
  { videoId: '5Qk6Xc2ZVkI', songId: 'yt_naa_ready', titles: ['naa ready', 'na ready'], artistHints: ['anirudh', 'vijay'], label: 'Naa Ready', status: SEARCH_NOTE },
  { videoId: 'szvt1vD0Uug', titles: ['naa ready', 'na ready'], artistHints: ['anirudh', 'vijay'], label: 'Naa Ready', candidate: true, note: 'previous id; reported as a lyric video by the owner, not served' },

  // Vaathi Coming: "Master - Vaathi Coming 8K/4K Video Song". The previous id is titled just "Master - Vaathi Coming Video".
  { videoId: 'nIYZ4nbWq7w', songId: 'yt_vaathi_coming', titles: ['vaathi coming'], artistHints: ['anirudh'], label: 'Vaathi Coming', status: SEARCH_NOTE },
  { videoId: 'fRD_3vJagxk', titles: ['vaathi coming'], artistHints: ['anirudh'], label: 'Vaathi Coming', candidate: true, note: 'previous id; reported as a lyric video by the owner, not served' },

  // Aalaporaan Thamizhan: "Aalaporan Thamizhan 8K/4K Video Song".
  { videoId: 'UN7HgzJsFZA', songId: 'yt_aalaporaan_thamizhan', titles: ['aalaporaan thamizhan'], artistHints: ['rahman', 'vijay'], label: 'Aalaporaan Thamizhan (Mersal)', status: SEARCH_NOTE },
  { videoId: 'xsbLtHql4g8', titles: ['aalaporaan thamizhan'], artistHints: ['rahman', 'vijay'], label: 'Aalaporaan Thamizhan (Mersal)', candidate: true, note: 'previous id; reported as a lyric video by the owner, not served' },

  // Kept: titled "Arabic Kuthu - Video Song".
  { videoId: 'KUN5Uf9mObQ', songId: 'yt_arabic_kuthu', titles: ['arabic kuthu', 'halamithi habibo'], artistHints: ['anirudh', 'jonita'], label: 'Arabic Kuthu (Beast)' },

  // Kaavaalaa: "JAILER - Kaavaalaa Video Song". RVLNBVK8auM is titled "JAILER - Kaavaalaa Lyric Video".
  { videoId: 'lM8h5Mm6ODo', songId: 'yt_kaavaalaa', titles: ['kaavaalaa', 'kaavaala', 'kavaalaa', 'kaavaalaa nee kaavaalaa'], artistHints: ['anirudh', 'shilpa'], label: 'Kaavaalaa (Jailer)', status: SEARCH_NOTE },
  { videoId: 'RVLNBVK8auM', titles: ['kaavaalaa', 'kaavaala', 'kavaalaa', 'kaavaalaa nee kaavaalaa'], artistHints: ['anirudh', 'shilpa'], label: 'Kaavaalaa (Jailer)', candidate: true, note: 'titled "JAILER - Kaavaalaa Lyric Video": lyric video, not served' },

  // Kept: titled "Maari 2 - Rowdy Baby (Video Song)".
  { videoId: 'x6Q7c9RyMzk', songId: 'yt_rowdy_baby', titles: ['rowdy baby'], artistHints: ['dhanush', 'dhee', 'yuvan'], label: 'Rowdy Baby (Maari 2)' },

  // Kept: titled "3 - Why This Kolaveri Di Official Video".
  { videoId: 'YR12Z8f1Dh8', songId: 'yt_kolaveri_di', titles: ['why this kolaveri di'], artistHints: ['dhanush', 'anirudh'], label: 'Why This Kolaveri Di' }
].map((e) => ({ status: VERIFICATION_NOTE, ...e }));
