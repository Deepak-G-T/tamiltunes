import { MusicProvider } from './musicProvider.js';

export const YOUTUBE_TAMIL_COLLECTION = [
  {
    id: 'yt_veezha_veera',
    title: 'Veezha Veera',
    artist: 'Sai Abhyankkar, Tippu, Arun Srinivasan',
    singers: 'Sai Abhyankkar, Tippu, Arun Srinivasan',
    album: 'OM Chapter 1: Udhiram',
    duration: 236,
    image: 'https://i.ytimg.com/vi/VeezhaVeera/hqdefault.jpg',
    youtubeId: '3X8E9M9G6x0',
    embedUrl: 'https://www.youtube-nocookie.com/embed/3X8E9M9G6x0?autoplay=1&enablejsapi=1',
    streamUrl: 'https://www.youtube-nocookie.com/embed/3X8E9M9G6x0?autoplay=1&enablejsapi=1',
    isPlayable: true,
    provider: 'youtube',
    category: 'trending',
    licenseNotice: 'Official YouTube IFrame Player Embed (Divo TV / Think Music)'
  },
  {
    id: 'yt_badass_leo',
    title: 'Badass (Leo)',
    artist: 'Anirudh Ravichander',
    singers: 'Anirudh Ravichander',
    album: 'Leo',
    duration: 229,
    image: 'https://i.ytimg.com/vi/badass_leo/hqdefault.jpg',
    youtubeId: 'I7x_5lFk89s',
    embedUrl: 'https://www.youtube-nocookie.com/embed/I7x_5lFk89s?autoplay=1&enablejsapi=1',
    streamUrl: 'https://www.youtube-nocookie.com/embed/I7x_5lFk89s?autoplay=1&enablejsapi=1',
    isPlayable: true,
    provider: 'youtube',
    category: 'trending',
    licenseNotice: 'Official YouTube IFrame Player Embed (Sony Music South)'
  },
  {
    id: 'yt_hukum_jailer',
    title: 'Hukum - Thalaivar Alappara',
    artist: 'Anirudh Ravichander, Super Subu',
    singers: 'Anirudh Ravichander',
    album: 'Jailer',
    duration: 206,
    image: 'https://i.ytimg.com/vi/hukum_jailer/hqdefault.jpg',
    youtubeId: '1F3HM635S0k',
    embedUrl: 'https://www.youtube-nocookie.com/embed/1F3HM635S0k?autoplay=1&enablejsapi=1',
    streamUrl: 'https://www.youtube-nocookie.com/embed/1F3HM635S0k?autoplay=1&enablejsapi=1',
    isPlayable: true,
    provider: 'youtube',
    category: 'trending',
    licenseNotice: 'Official YouTube IFrame Player Embed (Sun TV)'
  },
  {
    id: 'yt_naa_ready',
    title: 'Naa Ready',
    artist: 'Thalapathy Vijay, Anirudh Ravichander',
    singers: 'Thalapathy Vijay, Anirudh Ravichander',
    album: 'Leo',
    duration: 248,
    image: 'https://i.ytimg.com/vi/naa_ready/hqdefault.jpg',
    youtubeId: 'szvt1vD0Uug',
    embedUrl: 'https://www.youtube-nocookie.com/embed/szvt1vD0Uug?autoplay=1&enablejsapi=1',
    streamUrl: 'https://www.youtube-nocookie.com/embed/szvt1vD0Uug?autoplay=1&enablejsapi=1',
    isPlayable: true,
    provider: 'youtube',
    category: 'trending',
    licenseNotice: 'Official YouTube IFrame Player Embed (Sony Music South)'
  },
  {
    id: 'yt_aaluma_doluma',
    title: 'Aaluma Doluma',
    artist: 'Anirudh Ravichander, Badshah, G. Rokesh',
    singers: 'Anirudh Ravichander',
    album: 'Vedalam',
    duration: 258,
    image: 'https://i.ytimg.com/vi/aaluma_doluma/hqdefault.jpg',
    youtubeId: 'uLpQvi8b_60',
    embedUrl: 'https://www.youtube-nocookie.com/embed/uLpQvi8b_60?autoplay=1&enablejsapi=1',
    streamUrl: 'https://www.youtube-nocookie.com/embed/uLpQvi8b_60?autoplay=1&enablejsapi=1',
    isPlayable: true,
    provider: 'youtube',
    category: 'gana',
    licenseNotice: 'Official YouTube IFrame Player Embed (Sony Music South)'
  },
  {
    id: 'yt_vaathi_coming',
    title: 'Vaathi Coming',
    artist: 'Anirudh Ravichander, Gana Balachandar',
    singers: 'Anirudh Ravichander, Gana Balachandar',
    album: 'Master',
    duration: 230,
    image: 'https://i.ytimg.com/vi/vaathi_coming/hqdefault.jpg',
    youtubeId: 'fRD_3vJagxk',
    embedUrl: 'https://www.youtube-nocookie.com/embed/fRD_3vJagxk?autoplay=1&enablejsapi=1',
    streamUrl: 'https://www.youtube-nocookie.com/embed/fRD_3vJagxk?autoplay=1&enablejsapi=1',
    isPlayable: true,
    provider: 'youtube',
    category: 'gana',
    licenseNotice: 'Official YouTube IFrame Player Embed (Sony Music South)'
  }
];

export class YouTubeIframeProvider extends MusicProvider {
  constructor() {
    super('youtube');
  }

  async searchTracks(query, options = {}) {
    const q = (query || '').toLowerCase().trim();
    const matches = YOUTUBE_TAMIL_COLLECTION.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q))
    );

    return {
      songs: matches,
      albums: [],
      artists: []
    };
  }

  async getSong(id) {
    const clean = id.replace(/^yt_/, '');
    return YOUTUBE_TAMIL_COLLECTION.find((s) => s.id === id || s.id === `yt_${clean}`) || null;
  }

  async getHomeFeed() {
    return {
      trending: YOUTUBE_TAMIL_COLLECTION.filter((s) => s.category === 'trending'),
      gana: YOUTUBE_TAMIL_COLLECTION.filter((s) => s.category === 'gana'),
      latest: YOUTUBE_TAMIL_COLLECTION.slice(0, 4),
      melodies: [],
      nineties: [],
      twoThousands: [],
      love: [],
      sad: [],
      folk: [],
      instrumental: [],
      popularAlbums: [],
      popularArtists: [],
      albums: [],
      artists: []
    };
  }
}
