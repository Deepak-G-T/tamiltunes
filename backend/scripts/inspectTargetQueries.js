import { JioSaavnProvider } from '../src/services/music/jiosaavnProvider.js';
import { inspectFilterDecision } from './evaluateSearch.js';

const TARGET_QUERIES = [
  'kandha sashti kavasam',
  'vinayagar agaval',
  'murugan devotional tamil',
  'thiruppugazh',
  'enjoy enjaami',
  'katchi sera',
  'telugu dj songs',
  'kannada kgf songs'
];

async function inspect() {
  const provider = new JioSaavnProvider();

  for (const q of TARGET_QUERIES) {
    console.log('\n' + '='.repeat(80));
    console.log(`QUERY: "${q}"`);
    console.log('='.repeat(80));

    const candidates = await provider.searchSongs(q, 15);
    const kept = [];
    const dropped = [];

    for (const song of candidates) {
      const decision = inspectFilterDecision(song);
      const isTamilDevotionalOrIndie = q.includes('devotional') || q.includes('sashti') || q.includes('agaval') || q.includes('thiruppugazh') || q.includes('enjaami') || q.includes('katchi');
      const isNonTamil = q.includes('telugu') || q.includes('kannada');

      let classification = '';
      if (decision.pass) {
        if (isNonTamil) {
          // If song is actually a non-Tamil track or unrelated
          classification = song.language && song.language !== 'tamil' ? 'FALSE_POSITIVE' : 'CORRECT_KEEPER';
        } else {
          classification = 'CORRECT_KEEPER';
        }
        kept.push({ song, decision, classification });
      } else {
        if (isTamilDevotionalOrIndie) {
          // If it was a genuine Tamil devotional or indie track dropped by filter
          const lang = (song.language || '').toLowerCase();
          if (lang === 'tamil' || !lang) {
            classification = 'FALSE_NEGATIVE';
          } else {
            classification = 'CORRECT_DROP';
          }
        } else {
          classification = 'CORRECT_DROP';
        }
        dropped.push({ song, decision, classification });
      }
    }

    console.log(`\n  KEPT (${kept.length}):`);
    if (kept.length === 0) console.log('    (None)');
    kept.forEach((k, idx) => {
      console.log(`    ${idx + 1}. [${k.classification}] "${k.song.title}" - ${k.song.artist} | Lang: ${k.decision.language} | Reason: ${k.decision.reason}`);
    });

    console.log(`\n  DROPPED (${dropped.length}):`);
    if (dropped.length === 0) console.log('    (None)');
    dropped.forEach((d, idx) => {
      console.log(`    ${idx + 1}. [${d.classification}] "${d.song.title}" - ${d.song.artist} | Lang: ${d.decision.language} | Reason: ${d.decision.reason}`);
    });
  }
}

inspect();
