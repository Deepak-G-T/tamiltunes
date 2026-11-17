import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JioSaavnProvider } from '../src/services/music/jiosaavnProvider.js';
import { inspectFilterDecision } from './evaluateSearch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GOLDEN_QUERIES = [
  // 1. Classical / Golden Era (7)
  'sivaji ganesan tm soundararajan',
  'mgr kannadasan hits',
  'viswanathan ramamoorthy',
  'ilaiyaraaja 80s hits',
  'spb 80s tamil melodies',
  'kannadasan hits',
  'k.j. yesudas tamil evergreens',

  // 2. 90s & 2000s Classics (5)
  'a.r. rahman 90s hits',
  'harris jayaraj hits',
  'yuvan shankar raja melodies',
  'vidyasagar tamil hits',
  'deva gana padalgal',

  // 3. Modern Kollywood Film Hits (8)
  'badass leo',
  'hukum jailer',
  'naa ready',
  'aalaporaan thamizhan',
  'vaathi coming',
  'arabic kuthu',
  'kaavaalaa',
  'veezha veera',

  // 4. Indie / Independent Tamil Music (5)
  'enjoy enjaami',
  'katchi sera',
  'therukural arivu',
  'dhee indie tamil',
  'sean roldan live',

  // 5. Devotional Scriptures & Traditional (5)
  'kandha sashti kavasam',
  'vinayagar agaval tms',
  'thiruppugazh tms',
  'amman padalgal l.r. eswari',
  'murugan devotional tamil',

  // 6. Gaana / Kuthu (3)
  'marana mass',
  'aaluma doluma',
  'danga maari',

  // 7. Misspellings & Slang (3)
  'vezha vera',
  'alirudh ravichander',
  'kolavari di',

  // 8. Non-Tamil Language Incursions (2)
  'telugu dj songs',
  'hindi arijit singh hits',

  // 9. Spam / Social Media Meme Formats (2)
  'whatsapp status tamil',
  'slowed reverb tamil'
];

const escapeCsv = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

async function exportGoldenCandidates() {
  console.log(`Starting Golden Candidates Export (${GOLDEN_QUERIES.length} queries)...`);
  const provider = new JioSaavnProvider();
  const rows = [];

  // Header row
  rows.push([
    'query',
    'title',
    'artist',
    'album',
    'label',
    'language_tag',
    'current_decision',
    'current_reason',
    'should_keep'
  ].join(','));

  const auditDir = path.resolve(__dirname, '../../audit');
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }

  let totalSongs = 0;

  for (let i = 0; i < GOLDEN_QUERIES.length; i++) {
    const q = GOLDEN_QUERIES[i];
    console.log(`[${i + 1}/${GOLDEN_QUERIES.length}] Querying: "${q}"...`);
    try {
      const candidates = await provider.searchSongs(q, 10);
      for (const song of candidates) {
        const decision = inspectFilterDecision(song);
        const songLabel = song.label || song.more_info?.label || '';
        const lang = song.language || song.more_info?.language || '';

        const csvLine = [
          escapeCsv(q),
          escapeCsv(song.title),
          escapeCsv(song.artist || song.singers || ''),
          escapeCsv(song.album || ''),
          escapeCsv(songLabel),
          escapeCsv(lang),
          escapeCsv(decision.pass ? 'KEEP' : 'DROP'),
          escapeCsv(decision.reason),
          '' // should_keep is deliberately empty for manual human labeling
        ].join(',');

        rows.push(csvLine);
        totalSongs++;
      }
    } catch (err) {
      console.error(`Error querying "${q}":`, err.message);
    }
  }

  const outputPath = path.join(auditDir, 'golden_candidates.csv');
  fs.writeFileSync(outputPath, rows.join('\n'), 'utf8');
  console.log(`\nSuccessfully exported ${totalSongs} candidates across ${GOLDEN_QUERIES.length} queries to: ${outputPath}`);
}

exportGoldenCandidates().catch((err) => {
  console.error('Fatal export error:', err);
  process.exit(1);
});
