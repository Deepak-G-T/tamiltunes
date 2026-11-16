import { musicService, isOfficialFilmRelease } from '../src/services/music/providerManager.js';

const TEST_QUERIES = [
  // Kollywood Hits / Film releases
  'veezha veera',
  'badass leo',
  'hukum jailer',
  'naa ready',
  'aalaporaan thamizhan',
  'vaathi coming',
  'arabic kuthu',
  'rowdy baby',
  'kaavaalaa',
  'why this kolaveri di',
  'katchi sera',
  'vettaiyan',
  'goat matta',
  'oru manam',
  'enjoy enjaami',
  
  // Composers & Eras
  'anirudh',
  'ar rahman',
  'yuvan shankar raja',
  'ilaiyaraaja',
  'harris jayaraj',
  'sai abhyankkar',
  'santhosh narayanan',
  'vidyasagar',
  '90s tamil melodies',
  '2000s tamil hits',

  // Legitimate Film Gaana
  'marana mass',
  'aaluma doluma',
  'danga maari',
  'gana bala',
  'marana gana viji',

  // Dubs / Other Languages (should filter out)
  'telugu hit songs',
  'hindi romantic',
  'malayalam melodies',
  'kannada songs',
  'punjabi pop',

  // Amateur / Meme / Spam queries (should reject)
  'trending gana surya',
  'salem gana velu',
  'whatsapp status tamil',
  'bass boosted tamil',
  'slowed reverb tamil'
];

async function evaluate() {
  console.log('='.repeat(80));
  console.log('TAMIL SEARCH & POSITIVE FILM FILTER EVALUATION');
  console.log('='.repeat(80));

  const results = [];

  for (const q of TEST_QUERIES) {
    try {
      const searchRes = await musicService.searchTracks(q, { type: 'songs' });
      const songs = searchRes.songs || [];
      const topSong = songs[0];

      results.push({
        query: q,
        count: songs.length,
        topTitle: topSong ? topSong.title : 'None',
        topArtist: topSong ? topSong.artist : 'None',
        topPass: topSong ? isOfficialFilmRelease(topSong) : false
      });
    } catch (err) {
      results.push({
        query: q,
        count: 0,
        topTitle: `ERROR: ${err.message}`,
        topArtist: '',
        topPass: false
      });
    }
  }

  console.log('| Query | Count | Top Result | Artist | Filter Status |');
  console.log('|---|---|---|---|---|');
  for (const r of results) {
    const title = (r.topTitle || '').slice(0, 32);
    const artist = (r.topArtist || '').slice(0, 24);
    const status = r.count > 0 ? (r.topPass ? 'PASS (Official)' : 'FAIL') : 'NO_RESULTS';
    console.log(`| ${r.query.padEnd(20)} | ${String(r.count).padStart(3)} | ${title.padEnd(32)} | ${artist.padEnd(24)} | ${status} |`);
  }
  console.log('='.repeat(80));
}

evaluate();
