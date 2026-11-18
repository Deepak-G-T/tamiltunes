import { MusicProvider } from './musicProvider.js';

export const SAMPLE_AUDIO_PREVIEWS = [
  'https://aac.saavncdn.com/415/46a7b21d2a3f4b9e019a7cdff7442c55_320.mp4',
  'https://aac.saavncdn.com/187/0c4d0aee91a3ac81d4b645ec448a2960_320.mp4',
  'https://aac.saavncdn.com/194/af240a77084e42e66f18defb87cda42a_320.mp4',
  'https://aac.saavncdn.com/347/c536b256fca6b96aa432322c11c21fbb_320.mp4',
  'https://aac.saavncdn.com/492/eb45d961a1639b3c3a6df4c8777fa71c_320.mp4',
  'https://aac.saavncdn.com/702/d7abe1123a022f3fb9f3e4bf725a032a_320.mp4',
  'https://aac.saavncdn.com/726/c395c9ca17f6183955ffe41fa0dbb6bc_320.mp4',
  'https://aac.saavncdn.com/519/b5941a80c065c47024925def4b0a8b53_320.mp4',
  'https://aac.saavncdn.com/450/4f7b9da8e887586e60b11afb602befac_320.mp4',
  'https://aac.saavncdn.com/595/86c6a67ff7120d287cb4484ea020f488_320.mp4',
  'https://aac.saavncdn.com/006/40aacc11863cba58d37eefcbd23bee99_320.mp4'
];

export const CURATED_TAMIL_SONGS = [
  // Trending Kollywood Hits
  {
    id: 'tt_trending_1',
    title: 'Badass (Leo)',
    artist: 'Anirudh Ravichander',
    singers: 'Anirudh Ravichander',
    album: 'Leo',
    duration: 229,
    year: '2023',
    image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/415/46a7b21d2a3f4b9e019a7cdff7442c55_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/415/46a7b21d2a3f4b9e019a7cdff7442c55_320.mp4',
    isPlayable: true,
    category: 'trending',
    licenseNotice: 'Original Tamil Master Audio (Leo)'
  },
  {
    id: 'tt_trending_2',
    title: 'Hukum - Thalaivar Alappara',
    artist: 'Anirudh Ravichander, Super Subu',
    singers: 'Anirudh Ravichander',
    album: 'Jailer',
    duration: 206,
    year: '2023',
    image: 'https://c.saavncdn.com/187/Jailer-Tamil-2023-20230728081443-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/187/0c4d0aee91a3ac81d4b645ec448a2960_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/187/0c4d0aee91a3ac81d4b645ec448a2960_320.mp4',
    isPlayable: true,
    category: 'trending',
    licenseNotice: 'Original Tamil Master Audio (Jailer)'
  },
  {
    id: 'tt_trending_3',
    title: 'Naa Ready',
    artist: 'Thalapathy Vijay, Anirudh Ravichander',
    singers: 'Thalapathy Vijay, Anirudh Ravichander',
    album: 'Leo',
    duration: 248,
    year: '2023',
    image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/194/af240a77084e42e66f18defb87cda42a_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/194/af240a77084e42e66f18defb87cda42a_320.mp4',
    isPlayable: true,
    category: 'trending',
    licenseNotice: 'Original Tamil Master Audio (Leo)'
  },
  {
    id: 'tt_trending_4',
    title: 'Vaathi Coming',
    artist: 'Anirudh Ravichander, Gana Balachandar',
    singers: 'Anirudh Ravichander',
    album: 'Master',
    duration: 230,
    year: '2021',
    image: 'https://c.saavncdn.com/347/Master-Tamil-2020-20200316084627-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/347/c536b256fca6b96aa432322c11c21fbb_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/347/c536b256fca6b96aa432322c11c21fbb_320.mp4',
    isPlayable: true,
    category: 'trending',
    licenseNotice: 'Original Tamil Master Audio (Master)'
  },
  {
    id: 'tt_trending_5',
    title: 'Aalaporaan Thamizhan',
    artist: 'A.R. Rahman, Kailash Kher, Sathya Prakash',
    singers: 'Kailash Kher, Sathya Prakash, D. Sathyaprakash',
    album: 'Mersal',
    duration: 348,
    year: '2017',
    image: 'https://c.saavncdn.com/492/Mersal-Tamil-2017-20170820120559-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/492/eb45d961a1639b3c3a6df4c8777fa71c_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/492/eb45d961a1639b3c3a6df4c8777fa71c_320.mp4',
    isPlayable: true,
    category: 'trending',
    licenseNotice: 'Original Tamil Master Audio (Mersal)'
  },
  {
    id: 'tt_folk_1',
    title: 'Arabic Kuthu - Halamithi Habibo',
    artist: 'Anirudh Ravichander, Jonita Gandhi',
    singers: 'Anirudh Ravichander, Jonita Gandhi',
    album: 'Beast',
    duration: 280,
    year: '2022',
    image: 'https://c.saavncdn.com/510/Beast-Tamil-2022-20220504184736-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/510/9d96fc7ddd4ffadb745f25aed86f7a4e_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/510/9d96fc7ddd4ffadb745f25aed86f7a4e_320.mp4',
    isPlayable: true,
    category: 'folk',
    licenseNotice: 'Original Tamil Master Audio (Beast)'
  },
  {
    id: 'tt_folk_2',
    title: 'Kaavaalaa',
    artist: 'Anirudh Ravichander, Shilpa Rao',
    singers: 'Shilpa Rao, Anirudh Ravichander',
    album: 'Jailer',
    duration: 191,
    year: '2023',
    image: 'https://c.saavncdn.com/187/Jailer-Tamil-2023-20230728081443-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/187/49797372d021638077d8a6b749068bc8_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/187/49797372d021638077d8a6b749068bc8_320.mp4',
    isPlayable: true,
    category: 'folk',
    licenseNotice: 'Original Tamil Master Audio (Jailer)'
  },
  {
    id: 'tt_folk_3',
    title: 'Rowdy Baby',
    artist: 'Dhanush, Yuvan Shankar Raja, Dhee',
    singers: 'Dhanush, Dhee',
    album: 'Maari 2',
    duration: 284,
    year: '2018',
    image: 'https://c.saavncdn.com/276/Maari-2-Tamil-2018-20260203193952-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/276/64b835b4e1829992f8d35f54d6dad5f3_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/276/64b835b4e1829992f8d35f54d6dad5f3_320.mp4',
    isPlayable: true,
    category: 'folk',
    licenseNotice: 'Original Tamil Master Audio (Maari 2)'
  },
  {
    id: 'tt_gana_1',
    title: 'Vaathi Coming',
    artist: 'Anirudh Ravichander, Gana Balachandar',
    singers: 'Anirudh Ravichander, Gana Balachandar',
    album: 'Master',
    duration: 230,
    year: '2021',
    image: 'https://c.saavncdn.com/347/Master-Tamil-2020-20200316084627-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/347/c536b256fca6b96aa432322c11c21fbb_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/347/c536b256fca6b96aa432322c11c21fbb_320.mp4',
    isPlayable: true,
    category: 'gana',
    licenseNotice: 'Original Tamil Master Audio (Master)'
  },
  {
    id: 'tt_gana_2',
    title: 'Aaluma Doluma',
    artist: 'Anirudh Ravichander, Badshah, G. Rokesh',
    singers: 'Anirudh Ravichander, Badshah',
    album: 'Vedalam',
    duration: 258,
    year: '2015',
    image: 'https://c.saavncdn.com/323/Vedalam-Tamil-2015-20260120201356-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/323/7b0f4cf0f773cff9514e9913312610b7_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/323/7b0f4cf0f773cff9514e9913312610b7_320.mp4',
    isPlayable: true,
    category: 'gana',
    licenseNotice: 'Original Tamil Master Audio (Vedalam)'
  },
  {
    id: 'tt_gana_3',
    title: 'Danga Maari Oodhari',
    artist: 'Harris Jayaraj, Dhanush, Marana Gana Viji',
    singers: 'Dhanush, Marana Gana Viji, Naveen Madhav',
    album: 'Anegan',
    duration: 342,
    year: '2014',
    image: 'https://c.saavncdn.com/167/Anegan-Tamil-2014-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/167/e52294bdf34988e404bf71b3e94a8219_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/167/e52294bdf34988e404bf71b3e94a8219_320.mp4',
    isPlayable: true,
    category: 'gana',
    licenseNotice: 'Original Tamil Master Audio (Anegan)'
  },
  {
    id: 'tt_folk_4',
    title: 'Aaluma Doluma',
    artist: 'Anirudh Ravichander, Badshah, G. Rokesh',
    singers: 'Anirudh Ravichander, Badshah',
    album: 'Vedalam',
    duration: 258,
    year: '2015',
    image: 'https://c.saavncdn.com/323/Vedalam-Tamil-2015-20260120201356-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/323/7b0f4cf0f773cff9514e9913312610b7_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/323/7b0f4cf0f773cff9514e9913312610b7_320.mp4',
    isPlayable: true,
    category: 'folk',
    licenseNotice: 'Original Tamil Master Audio (Vedalam)'
  },
  {
    id: 'tt_melodies_1',
    title: 'Katchi Sera',
    artist: 'Sai Abhyankkar',
    singers: 'Sai Abhyankkar',
    album: 'Think Indie',
    duration: 187,
    year: '2024',
    image: 'https://c.saavncdn.com/118/Katchi-Sera-From-Think-Indie-Tamil-2024-20251026074526-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/118/3456f4e5990e8fb33d7af6678aca034a_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/118/3456f4e5990e8fb33d7af6678aca034a_320.mp4',
    isPlayable: true,
    category: 'melodies',
    licenseNotice: 'Original Tamil Master Audio (Think Indie)'
  },

  // 90s Golden Era Classics
  {
    id: 'tt_90s_1',
    title: 'Chinna Chinna Aasai',
    artist: 'A.R. Rahman, Minmini',
    singers: 'Minmini',
    album: 'Roja',
    duration: 295,
    year: '1992',
    image: 'https://c.saavncdn.com/702/Roja-Tamil-1992-20251011230302-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/702/d7abe1123a022f3fb9f3e4bf725a032a_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/702/d7abe1123a022f3fb9f3e4bf725a032a_320.mp4',
    isPlayable: true,
    category: '90s',
    licenseNotice: 'Original Tamil Master Audio (Roja)'
  },
  {
    id: 'tt_90s_2',
    title: 'Ennavale Adi Ennavale',
    artist: 'A.R. Rahman, Unni Menon',
    singers: 'Unni Menon',
    album: 'Kadhalan',
    duration: 310,
    year: '1994',
    image: 'https://c.saavncdn.com/017/Kaadhalan-Tamil-1995-20251203113001-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/726/c395c9ca17f6183955ffe41fa0dbb6bc_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/726/c395c9ca17f6183955ffe41fa0dbb6bc_320.mp4',
    isPlayable: true,
    category: '90s',
    licenseNotice: 'Original Tamil Master Audio (Kadhalan)'
  },
  {
    id: 'tt_90s_3',
    title: 'Thendral Vanthu Theendum Pothu',
    artist: 'Ilaiyaraaja, S. Janaki',
    singers: 'Ilaiyaraaja, S. Janaki',
    album: 'Avatharam',
    duration: 280,
    year: '1995',
    image: 'https://c.saavncdn.com/717/Avatharam-Tamil-2017-20190327061509-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/519/b5941a80c065c47024925def4b0a8b53_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/519/b5941a80c065c47024925def4b0a8b53_320.mp4',
    isPlayable: true,
    category: '90s',
    licenseNotice: 'Original Tamil Master Audio (Avatharam)'
  },

  // 2000s Nostalgic Hits
  {
    id: 'tt_2000s_1',
    title: 'Vaseegara',
    artist: 'Harris Jayaraj, Bombay Jayashri',
    singers: 'Bombay Jayashri',
    album: 'Minnale',
    duration: 300,
    year: '2001',
    image: 'https://c.saavncdn.com/137/Minnalae-Tamil-2001-20210423104146-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/450/4f7b9da8e887586e60b11afb602befac_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/450/4f7b9da8e887586e60b11afb602befac_320.mp4',
    isPlayable: true,
    category: '2000s',
    licenseNotice: 'Original Tamil Master Audio (Minnale)'
  },
  {
    id: 'tt_2000s_2',
    title: 'Munbe Vaa',
    artist: 'A.R. Rahman, Naresh Iyer, Shreya Ghoshal',
    singers: 'Naresh Iyer, Shreya Ghoshal',
    album: 'Sillunu Oru Kaadhal',
    duration: 358,
    year: '2006',
    image: 'https://c.saavncdn.com/106/Jillunu-Oru-Kadhal-2006-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/595/86c6a67ff7120d287cb4484ea020f488_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/595/86c6a67ff7120d287cb4484ea020f488_320.mp4',
    isPlayable: true,
    category: '2000s',
    licenseNotice: 'Original Tamil Master Audio (Sillunu Oru Kaadhal)'
  },
  {
    id: 'tt_2000s_3',
    title: 'Kannaana Kanney',
    artist: 'D. Imman, Sid Sriram',
    singers: 'Sid Sriram',
    album: 'Viswasam',
    duration: 269,
    year: '2019',
    image: 'https://c.saavncdn.com/006/Viswasam-Tamil-2020-20240321064638-500x500.jpg',
    streamUrl: 'https://aac.saavncdn.com/006/40aacc11863cba58d37eefcbd23bee99_320.mp4',
    cdnStreamUrl: 'https://aac.saavncdn.com/006/40aacc11863cba58d37eefcbd23bee99_320.mp4',
    isPlayable: true,
    category: 'melodies',
    licenseNotice: 'Original Tamil Master Audio (Viswasam)'
  }
];

export const CURATED_ALBUMS = [
  {
    id: 'album_leo',
    name: 'Leo',
    title: 'Leo',
    artist: 'Anirudh Ravichander',
    music: 'Anirudh Ravichander',
    year: '2023',
    image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
    songs: CURATED_TAMIL_SONGS.filter((s) => s.album === 'Leo')
  },
  {
    id: 'album_jailer',
    name: 'Jailer',
    title: 'Jailer',
    artist: 'Anirudh Ravichander',
    music: 'Anirudh Ravichander',
    year: '2023',
    image: 'https://c.saavncdn.com/187/Jailer-Tamil-2023-20230728081443-500x500.jpg',
    songs: CURATED_TAMIL_SONGS.filter((s) => s.album === 'Jailer')
  },
  {
    id: 'album_master',
    name: 'Master',
    title: 'Master',
    artist: 'Anirudh Ravichander',
    music: 'Anirudh Ravichander',
    year: '2021',
    image: 'https://c.saavncdn.com/347/Master-Tamil-2020-20200316084627-500x500.jpg',
    songs: CURATED_TAMIL_SONGS.filter((s) => s.album === 'Master')
  },
  {
    id: 'album_roja',
    name: 'Roja',
    title: 'Roja',
    artist: 'A.R. Rahman',
    music: 'A.R. Rahman',
    year: '1992',
    image: 'https://c.saavncdn.com/702/Roja-Tamil-1992-20251011230302-500x500.jpg',
    songs: CURATED_TAMIL_SONGS.filter((s) => s.album === 'Roja')
  },
  {
    id: 'album_minnale',
    name: 'Minnale',
    title: 'Minnale',
    artist: 'Harris Jayaraj',
    music: 'Harris Jayaraj',
    year: '2001',
    image: 'https://c.saavncdn.com/137/Minnalae-Tamil-2001-20210423104146-500x500.jpg',
    songs: CURATED_TAMIL_SONGS.filter((s) => s.album === 'Minnale')
  }
];

export const CURATED_ARTISTS = [
  {
    id: 'artist_anirudh',
    name: 'Anirudh Ravichander',
    role: 'Music Director & Singer',
    image: 'https://c.saavncdn.com/artists/Anirudh_Ravichander_003_20260121134149_500x500.jpg',
    topSongs: CURATED_TAMIL_SONGS.filter((s) => s.artist.includes('Anirudh')),
    albums: CURATED_ALBUMS.filter((a) => a.artist.includes('Anirudh'))
  },
  {
    id: 'artist_ar_rahman',
    name: 'A.R. Rahman',
    role: 'Composer & Producer',
    image: 'https://c.saavncdn.com/artists/AR_Rahman_002_20210120084455_500x500.jpg',
    topSongs: CURATED_TAMIL_SONGS.filter((s) => s.artist.includes('Rahman')),
    albums: CURATED_ALBUMS.filter((a) => a.artist.includes('Rahman'))
  },
  {
    id: 'artist_harris_jayaraj',
    name: 'Harris Jayaraj',
    role: 'Music Director',
    image: 'https://c.saavncdn.com/artists/Harris_Jayaraj_002_20230718071330_500x500.jpg',
    topSongs: CURATED_TAMIL_SONGS.filter((s) => s.artist.includes('Harris')),
    albums: CURATED_ALBUMS.filter((a) => a.artist.includes('Harris'))
  },
  {
    id: 'artist_sid_sriram',
    name: 'Sid Sriram',
    role: 'Playback Singer',
    image: 'https://c.saavncdn.com/artists/Sid_Sriram_005_20240425180600_500x500.jpg',
    topSongs: CURATED_TAMIL_SONGS.filter((s) => s.artist.includes('Sid Sriram')),
    albums: []
  },
  {
    id: 'artist_yuvan',
    name: 'Yuvan Shankar Raja',
    role: 'Music Director & Singer',
    image: 'https://c.saavncdn.com/artists/Yuvan_Shankar_Raja_002_20180802174245_500x500.jpg',
    topSongs: CURATED_TAMIL_SONGS.filter((s) => s.artist.includes('Yuvan')),
    albums: []
  },
  {
    id: 'artist_ilaiyaraaja',
    name: 'Ilaiyaraaja',
    role: 'Legendary Maestro',
    image: 'https://c.saavncdn.com/artists/Ilaiyaraaja_001_20251020081419_500x500.jpg',
    topSongs: CURATED_TAMIL_SONGS.filter((s) => s.artist.includes('Ilaiyaraaja')),
    albums: []
  },
  {
    id: 'artist_santhosh',
    name: 'Santhosh Narayanan',
    role: 'Music Director',
    image: 'https://c.saavncdn.com/artists/Santhosh_Narayanan_002_20250527101718_500x500.jpg',
    topSongs: CURATED_TAMIL_SONGS.filter((s) => s.artist.includes('Santhosh')),
    albums: []
  },
  {
    id: 'artist_sai_abhyankkar',
    name: 'Sai Abhyankkar',
    role: 'Music Director & Singer',
    image: 'https://c.saavncdn.com/artists/Sai_Abhyankkar_003_20250707122433_500x500.jpg',
    topSongs: CURATED_TAMIL_SONGS.filter((s) => s.artist.includes('Sai Abhyankkar')),
    albums: []
  }
];

export class LocalAudioProvider extends MusicProvider {
  constructor() {
    super('local_authorized');
  }

  async search(query, type = 'all') {
    const q = (query || '').toLowerCase().trim();
    const songs = CURATED_TAMIL_SONGS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q))
    );
    const albums = CURATED_ALBUMS.filter(
      (a) => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    );
    const artists = CURATED_ARTISTS.filter((a) => a.name.toLowerCase().includes(q));

    return { songs, albums, artists };
  }

  async searchSongs(query, limit = 20) {
    const q = (query || '').toLowerCase().trim();
    return CURATED_TAMIL_SONGS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q))
    ).slice(0, limit);
  }

  async searchAlbums(query, limit = 20) {
    const q = (query || '').toLowerCase().trim();
    return CURATED_ALBUMS.filter(
      (a) => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    ).slice(0, limit);
  }

  async searchArtists(query, limit = 20) {
    const q = (query || '').toLowerCase().trim();
    return CURATED_ARTISTS.filter((a) => a.name.toLowerCase().includes(q)).slice(0, limit);
  }

  /** Offline "radio": other curated songs sharing the film, a singer or the home-feed shelf. */
  async getRecommendations(id, limit = 30) {
    const seed = CURATED_TAMIL_SONGS.find((s) => s.id === id);
    if (!seed) return [];
    const names = (v) => String(v || '').split(/,|&/).map((n) => n.trim().toLowerCase()).filter(Boolean);
    const seedNames = new Set(names(seed.singers || seed.artist));
    return CURATED_TAMIL_SONGS
      .filter((s) => s.id !== id)
      .map((s) => ({
        song: s,
        weight: (s.album === seed.album ? 2 : 0) + (names(s.singers || s.artist).some((n) => seedNames.has(n)) ? 1 : 0) + (s.category && s.category === seed.category ? 1 : 0)
      }))
      .filter((x) => x.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit)
      .map((x) => x.song);
  }

  async getSong(id) {
    return CURATED_TAMIL_SONGS.find((s) => s.id === id) || null;
  }

  async getAlbum(id) {
    return CURATED_ALBUMS.find((a) => a.id === id) || null;
  }

  async getArtist(id) {
    const artist = CURATED_ARTISTS.find(
      (a) => a.id === id || a.name.toLowerCase() === decodeURIComponent(id).toLowerCase()
    );
    return artist || null;
  }

  async getHomeFeed() {
    return {
      trending: CURATED_TAMIL_SONGS.filter((s) => s.category === 'trending'),
      albums: CURATED_ALBUMS,
      artists: CURATED_ARTISTS,
      nineties: CURATED_TAMIL_SONGS.filter((s) => s.category === '90s'),
      twoThousands: CURATED_TAMIL_SONGS.filter((s) => s.category === '2000s'),
      melodies: CURATED_TAMIL_SONGS.filter((s) => s.category === 'melodies'),
      folk: CURATED_TAMIL_SONGS.filter((s) => s.category === 'trending')
    };
  }
}
