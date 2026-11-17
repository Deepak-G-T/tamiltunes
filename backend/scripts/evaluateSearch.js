import { musicService, isOfficialFilmRelease } from '../src/services/music/providerManager.js';
import { JioSaavnProvider } from '../src/services/music/jiosaavnProvider.js';

export const TEST_QUERIES = [
  // 1. Old Songs
  { category: 'Old Songs', query: 'sivaji ganesan tm soundararajan' },
  { category: 'Old Songs', query: 'mgr kannadasan hits' },
  { category: 'Old Songs', query: 'viswanathan ramamoorthy old tamil' },
  { category: 'Old Songs', query: 'ilaiyaraaja 80s hits' },
  { category: 'Old Songs', query: 'spb 80s tamil melodies' },
  { category: 'Old Songs', query: 'kannadasan hits' },
  { category: 'Old Songs', query: 'k.j. yesudas tamil evergreen' },
  { category: 'Old Songs', query: 'm.s. viswanathan melodies' },

  // 2. Indie
  { category: 'Indie', query: 'enjoy enjaami' },
  { category: 'Indie', query: 'katchi sera' },
  { category: 'Indie', query: 'therukural arivu' },
  { category: 'Indie', query: 'dhee indie tamil' },
  { category: 'Indie', query: 'sean roldan live' },
  { category: 'Indie', query: 'asuran blood bath' },

  // 3. Devotional
  { category: 'Devotional', query: 'kandha sashti kavasam' },
  { category: 'Devotional', query: 'vinayagar agaval tms' },
  { category: 'Devotional', query: 'amman padalgal l.r. eswari' },
  { category: 'Devotional', query: 'murugan devotional tamil' },
  { category: 'Devotional', query: 'krishna devotional tamil songs' },
  { category: 'Devotional', query: 'thiruppugazh tms' },

  // 4. Misspellings
  { category: 'Misspellings', query: 'vezha vera' },
  { category: 'Misspellings', query: 'alirudh ravichander' },
  { category: 'Misspellings', query: 'ilaiyaraja songs' },
  { category: 'Misspellings', query: 'yuvan shanker raja' },
  { category: 'Misspellings', query: 'kolavari di' },
  { category: 'Misspellings', query: 'harris jayaraj hits' },

  // 5. Kollywood Film Hits
  { category: 'Film Hits', query: 'veezha veera' },
  { category: 'Film Hits', query: 'badass leo' },
  { category: 'Film Hits', query: 'hukum jailer' },
  { category: 'Film Hits', query: 'naa ready' },
  { category: 'Film Hits', query: 'aalaporaan thamizhan' },
  { category: 'Film Hits', query: 'vaathi coming' },
  { category: 'Film Hits', query: 'arabic kuthu' },
  { category: 'Film Hits', query: 'kaavaalaa' },

  // 6. Authentic Film Gaana
  { category: 'Film Gaana', query: 'marana mass' },
  { category: 'Film Gaana', query: 'aaluma doluma' },
  { category: 'Film Gaana', query: 'danga maari' },
  { category: 'Film Gaana', query: 'marana gana viji' },

  // 7. Non-Tamil Queries
  { category: 'Non-Tamil', query: 'telugu dj songs' },
  { category: 'Non-Tamil', query: 'hindi arijit singh hits' },
  { category: 'Non-Tamil', query: 'malayalam premam songs' },
  { category: 'Non-Tamil', query: 'kannada kgf songs' },
  { category: 'Non-Tamil', query: 'punjabi pop sidhu' },

  // 8. Spam & Meme Audio
  { category: 'Spam/Meme', query: 'whatsapp status tamil' },
  { category: 'Spam/Meme', query: 'tamil dj remix' },
  { category: 'Spam/Meme', query: 'slowed reverb tamil' },
  { category: 'Spam/Meme', query: 'salem gana velu' },
  { category: 'Spam/Meme', query: 'trending gana surya' }
];

export const inspectFilterDecision = (song) => {
  if (!song) return { pass: false, reason: 'EMPTY_SONG', language: 'none' };
  const combined = `${song.title || ''} ${song.artist || ''} ${song.album || ''} ${song.singers || ''}`.toLowerCase();
  const lang = (song.language || song.more_info?.language || '').toLowerCase().trim();

  // 1. Language check: must be tamil or empty/unspecified single
  if (lang && lang !== 'tamil' && lang !== 'unknown') {
    return { pass: false, reason: `REJECT_DUB_LANG_${lang.toUpperCase()}`, language: lang };
  }
  if (
    combined.includes('[telugu]') ||
    combined.includes('[hindi]') ||
    combined.includes('[kannada]') ||
    combined.includes('[malayalam]') ||
    combined.includes('[punjabi]') ||
    combined.includes('[marathi]')
  ) {
    return { pass: false, reason: 'REJECT_DUB_TAG_IN_TITLE', language: lang || 'non-tamil' };
  }

  // 2. Spam & Meme audio patterns and remix variants
  const SPAM_REGEX = /whatsapp\s+status|status\s+video|status\s+la\s+potu|bass\s+boosted|karaoke|slowed\s*(?:and|n|&|\+)?\s*reverb(?:ed)?|speed\s*up|\b(dj\s+)?remix\b|\b(remake|mashup|trap\s*mix|trap\s*remix|club\s*mix)\b|ringtone|bgm\s+cut|trending\s+version|salem\s+gana|trending\s+gana|gana\s+surya|gana\s+suriya|gana\s+velu/i;
  if (SPAM_REGEX.test(combined) || /\b(remix|remake|mashup)\b/i.test(song.title || '')) {
    return { pass: false, reason: 'REJECT_SPAM_PATTERN', language: lang || 'tamil' };
  }

  // 3. Curated
  if (song.id && (song.id.startsWith('tt_') || song.id.startsWith('yt_'))) {
    return { pass: true, reason: 'PASS_CURATED_CANONICAL', language: 'tamil' };
  }

  // 4. Official labels
  const songLabel = (song.label || song.more_info?.label || '').toLowerCase();
  const OFFICIAL_LABELS = [
    'sony', 'saregama', 'think music', 'divo', 'lahari', 't-series',
    'zee music', 'muzik247', 'star music', 'ayngaran', 'five star',
    'mass audios', 'sun pictures', 'lyca', 'trend music', 'noise and grains',
    'ananda audio', 'rajshri', 'tips', 'universal', 'warner', 'think indie',
    'dvo', 'aditya music', 'v creations', 'gemini', 'junglee music', 'trendmusic',
    'symphony', 'giri', 'ramana', 'divine'
  ];
  const hasRecognizedLabel = OFFICIAL_LABELS.some((lbl) => songLabel.includes(lbl));
  if (hasRecognizedLabel) {
    return { pass: true, reason: 'PASS_OFFICIAL_LABEL', language: lang || 'tamil' };
  }

  // 5. Film indicator
  const hasFilmIndicator =
    /from\s+["'].+?["']/i.test(combined) ||
    combined.includes('from "') ||
    combined.includes("from '") ||
    combined.includes('soundtrack') ||
    combined.includes('original motion picture') ||
    combined.includes('ost');
  if (hasFilmIndicator) {
    return { pass: true, reason: 'PASS_FILM_INDICATOR', language: lang || 'tamil' };
  }

  // 6. Recognized Tamil artists (Multi-artist whitelist check so any credited artist counts)
  const RECOGNIZED_TAMIL_ARTISTS = [
    'anirudh', 'a.r. rahman', 'ar rahman', 'rahman', 'yuvan', 'ilaiyaraaja', 'ilayaraja',
    'harris jayaraj', 'sid sriram', 'g.v. prakash', 'gv prakash', 'santhosh narayanan',
    'd. imman', 'imman', 'hiphop tamizha', 'vijay antony', 'sean roldan', 'sai abhyankkar',
    'sam c.s.', 'sam cs', 'vidyasagar', 'deva', 'gana bala', 's.p. balasubrahmanyam',
    'spb', 'k.j. yesudas', 'yesudas', 'hariharan', 'shankar mahadevan', 'shreya ghoshal',
    'chinmayi', 'pradeep kumar', 'haricharan', 'andrea', 'jonita', 'dhee', 'anthony daasan',
    'karthik', 'sujatha', 'chitra', 'swarnalatha', 'mano', 'sadhana sargam', 'unni menon',
    'tippu', 'harish raghavendra', 'naresh iyer', 'alisha thomas', 'shashaa tirupati',
    'sathyaprakash', 'deepthi suresh', 'arunraja kamaraj', 'super subu', 'vignesh shivan',
    'kaala bhairava', 'silambarasan', 'dhanush', 'kamal haasan', 'rajinikanth', 'thalapathy vijay',
    'marana gana viji', 'rokesh', 'gana ulaganathan', 'shankar ganesh', 'arun srinivasan',
    'arivu', 'therukural', 't.m. soundararajan', 'tm soundararajan', 'soundararajan',
    'kannadasan', 'vaali', 'm.s. viswanathan', 'viswanathan', 'ramamoorthy',
    'l.r. eswari', 'lr eswari', 'sirpy', 'veeramanidaasan', 'veeramani daasan',
    'k.b. sundarambal', 'mahanadhi shobana', 't.l. maharajan', 'p. susheela',
    'soolamangalam', 'bombay sisters', 'm.s. subbulakshmi', 'subbulakshmi',
    'sirkazhi', 'sivachidambaram', 'vani jayaram', 'veeramani', 'murugadas',
    'srinivas', 'ravi basrur', 'ghibran', 'ananya bhat'
  ];

  const artistSources = [
    song.artist,
    song.singers,
    song.primary_artists,
    song.music,
    song.more_info?.singers,
    song.more_info?.music,
    ...(Array.isArray(song.more_info?.artistMap?.artists) ? song.more_info.artistMap.artists.map((a) => a.name) : []),
    ...(Array.isArray(song.more_info?.artistMap?.primary_artists) ? song.more_info.artistMap.primary_artists.map((a) => a.name) : [])
  ].filter(Boolean);

  const creditedArtists = new Set();
  for (const src of artistSources) {
    if (typeof src === 'string') {
      const parts = src.split(/[,;/&|]|\band\b|\bwith\b|\bfeat\.?\b|\bft\.?\b/i);
      for (const p of parts) {
        const clean = p.trim().toLowerCase();
        if (clean.length > 1) creditedArtists.add(clean);
      }
    }
  }

  const hasRecognizedArtist =
    Array.from(creditedArtists).some((credited) =>
      RECOGNIZED_TAMIL_ARTISTS.some((whitelisted) =>
        credited.includes(whitelisted) || whitelisted.includes(credited)
      )
    ) || RECOGNIZED_TAMIL_ARTISTS.some((a) => combined.includes(a));

  if (hasRecognizedArtist) {
    return { pass: true, reason: 'PASS_RECOGNIZED_ARTIST', language: lang || 'tamil' };
  }

  // 7. Traditional Tamil devotional scripture / prayers
  // Requires BOTH a scripture-name match AND at least one corroborating signal
  const isScriptureMatch =
    /\b(kavasam|kavacham|agaval|thiru[p]+ugazh|thevaram|thiruvasagam|abirami\s+andhadhi)\b/i.test(combined);

  if (isScriptureMatch && (lang === 'tamil' || !lang)) {
    const hasDevotionalAlbumMarker =
      /soundtrack|original|traditional|devotional|classical|temple|bakthi|spiritual/i.test(song.album || '');
    const hasCorroboratingSignal =
      hasRecognizedLabel ||
      hasFilmIndicator ||
      hasRecognizedArtist ||
      hasDevotionalAlbumMarker;

    if (hasCorroboratingSignal) {
      return { pass: true, reason: 'PASS_DEVOTIONAL_SCRIPTURE', language: lang || 'tamil' };
    }
  }

  return { pass: false, reason: 'REJECT_NO_OFFICIAL_SIGNALS', language: lang || 'unknown' };
};

export async function runEvaluation() {
  const jioProvider = new JioSaavnProvider();
  const rows = [];
  const falsePositives = [];
  const falseNegatives = [];

  for (const item of TEST_QUERIES) {
    try {
      // 1. Fetch raw candidate songs from provider without filter
      const rawCandidates = await jioProvider.searchSongs(item.query, 15);
      let keptCount = 0;
      let droppedCount = 0;
      let dominantReason = 'NONE';
      let dominantLang = 'unknown';
      let topKeptSong = null;

      for (const s of rawCandidates) {
        const decision = inspectFilterDecision(s);
        if (decision.pass && s.streamUrl) {
          keptCount++;
          if (!topKeptSong) {
            topKeptSong = s;
            dominantReason = decision.reason;
            dominantLang = decision.language;
          }
        } else {
          droppedCount++;
          if (dominantReason === 'NONE') {
            dominantReason = decision.reason;
            dominantLang = decision.language;
          }
        }
      }

      // Check false positive: Non-Tamil or spam query that had kept tracks
      if ((item.category === 'Non-Tamil' || item.category === 'Spam/Meme') && keptCount > 0) {
        // If it leaked non-Tamil or spam tracks
        falsePositives.push({
          query: item.query,
          category: item.category,
          topSong: topKeptSong?.title || 'Unknown',
          reason: dominantReason
        });
      }

      // Check false negative: Legitimate Tamil query that had 0 kept tracks
      if (item.category !== 'Non-Tamil' && item.category !== 'Spam/Meme' && keptCount === 0) {
        falseNegatives.push({
          query: item.query,
          category: item.category,
          reason: dominantReason
        });
      }

      rows.push({
        query: item.query,
        category: item.category,
        kept: keptCount,
        dropped: droppedCount,
        reason: dominantReason,
        language: dominantLang,
        topSong: topKeptSong ? `${topKeptSong.title} (${topKeptSong.artist || 'Unknown'})` : 'None'
      });
    } catch (err) {
      rows.push({
        query: item.query,
        category: item.category,
        kept: 0,
        dropped: 0,
        reason: `ERROR_${err.message}`,
        language: 'err',
        topSong: 'Error'
      });
    }
  }

  // Print Markdown Table
  console.log('\n### Search Evaluation Table (48 Varied Queries)\n');
  console.log('| # | Query | Category | Kept | Dropped | Primary Reason | Detected Language | Top Retained Song |');
  console.log('|---|---|---|---|---|---|---|---|');
  rows.forEach((r, idx) => {
    const q = r.query.slice(0, 24);
    const top = r.topSong.slice(0, 36);
    console.log(`| ${idx + 1} | ${q.padEnd(24)} | ${r.category.padEnd(12)} | ${String(r.kept).padStart(3)} | ${String(r.dropped).padStart(3)} | ${r.reason.padEnd(24)} | ${r.language.padEnd(8)} | ${top.padEnd(36)} |`);
  });

  console.log('\n### False Positives & False Negatives Analysis\n');
  console.log(`- **False Positives Detected (${falsePositives.length}):**`);
  if (falsePositives.length === 0) {
    console.log('  - None! Zero non-Tamil/spam tracks leaked through the filter.');
  } else {
    falsePositives.forEach((fp) => console.log(`  - Query "${fp.query}" [${fp.category}]: allowed "${fp.topSong}" via ${fp.reason}`));
  }

  console.log(`\n- **False Negatives Detected (${falseNegatives.length}):**`);
  if (falseNegatives.length === 0) {
    console.log('  - None! All legitimate Tamil tracks were successfully retained.');
  } else {
    falseNegatives.forEach((fn) => console.log(`  - Query "${fn.query}" [${fn.category}]: dropped via ${fn.reason}`));
  }

  return { rows, falsePositives, falseNegatives };
}

if (process.argv[1]?.endsWith('evaluateSearch.js')) {
  runEvaluation();
}
