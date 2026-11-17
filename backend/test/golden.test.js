import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runGoldenEvaluation() {
  const labeledPath = path.resolve(__dirname, '../../audit/golden_labeled.csv');

  console.log('--- TamilTunes Golden Dataset Accuracy Test ---');

  const handleMissingLabels = (reason) => {
    console.warn(`\n⚠️  WARNING: Golden dataset evaluation cannot run: ${reason}`);
    console.warn(`   Exported candidates are in "audit/golden_candidates.csv".`);
    console.warn(`   To evaluate Tamil filter precision and recall, label rows and save to "${labeledPath}".`);
    if (process.env.GOLDEN_REQUIRED?.trim() === '1') {
      console.error(`\n❌ FATAL: GOLDEN_REQUIRED=1 is set, but golden labels are missing! Exiting non-zero.\n`);
      process.exit(1);
    }
    console.warn(`   [SKIPPED] Non-fatal in current mode (run with GOLDEN_REQUIRED=1 to enforce strict failure).\n`);
  };

  if (!fs.existsSync(labeledPath)) {
    handleMissingLabels(`File "${labeledPath}" does not exist yet.`);
    return;
  }

  const rawContent = fs.readFileSync(labeledPath, 'utf8').trim();
  const lines = rawContent.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    handleMissingLabels(`File "${labeledPath}" is empty or contains only headers.`);
    return;
  }

  // Simple CSV parser supporting quoted strings
  const parseCsvLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseCsvLine(lines[0]);
  const queryIdx = headers.indexOf('query');
  const titleIdx = headers.indexOf('title');
  const artistIdx = headers.indexOf('artist');
  const decIdx = headers.indexOf('current_decision');
  const reasonIdx = headers.indexOf('current_reason');
  const keepIdx = headers.indexOf('should_keep');

  if (keepIdx === -1) {
    handleMissingLabels('Column "should_keep" not found in golden_labeled.csv');
    return;
  }

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  const mismatches = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const query = cols[queryIdx] || '';
    const title = cols[titleIdx] || '';
    const artist = cols[artistIdx] || '';
    const currentDecision = (cols[decIdx] || '').toUpperCase();
    const currentReason = cols[reasonIdx] || '';
    const shouldKeepRaw = (cols[keepIdx] || '').toUpperCase().trim();

    if (!shouldKeepRaw) continue; // Skip unlabeled rows

    const groundTruthKeep = shouldKeepRaw === 'KEEP' || shouldKeepRaw === 'TRUE' || shouldKeepRaw === '1' || shouldKeepRaw === 'YES';
    const systemKeep = currentDecision === 'KEEP';

    if (systemKeep && groundTruthKeep) tp++;
    else if (systemKeep && !groundTruthKeep) {
      fp++;
      mismatches.push({ type: 'FALSE_POSITIVE', query, title, artist, currentDecision, shouldKeep: 'DROP', currentReason });
    } else if (!systemKeep && !groundTruthKeep) tn++;
    else if (!systemKeep && groundTruthKeep) {
      fn++;
      mismatches.push({ type: 'FALSE_NEGATIVE', query, title, artist, currentDecision, shouldKeep: 'KEEP', currentReason });
    }
  }

  const totalLabeled = tp + fp + tn + fn;
  if (totalLabeled === 0) {
    handleMissingLabels('No rows in golden_labeled.csv contain non-empty "should_keep" ground truth labels.');
    return;
  }

  const precision = tp + fp > 0 ? ((tp / (tp + fp)) * 100).toFixed(2) : 'N/A';
  const recall = tp + fn > 0 ? ((tp / (tp + fn)) * 100).toFixed(2) : 'N/A';
  const accuracy = (((tp + tn) / totalLabeled) * 100).toFixed(2);

  console.log(`\n================================================================================`);
  console.log(`Golden Dataset Evaluation Results (${totalLabeled} labeled samples):`);
  console.log(`  - True Positives (TP):  ${tp}`);
  console.log(`  - True Negatives (TN):  ${tn}`);
  console.log(`  - False Positives (FP): ${fp}`);
  console.log(`  - False Negatives (FN): ${fn}`);
  console.log(`  - Accuracy:             ${accuracy}%`);
  console.log(`  - Precision:            ${precision}%`);
  console.log(`  - Recall:               ${recall}%`);
  console.log(`================================================================================`);

  if (mismatches.length > 0) {
    console.log(`\nDetected ${mismatches.length} Mismatches against Ground Truth:`);
    mismatches.forEach((m, idx) => {
      console.log(`  ${idx + 1}. [${m.type}] Query: "${m.query}" | Song: "${m.title}" - ${m.artist} | System: ${m.currentDecision} | Expected: ${m.shouldKeep} | Reason: ${m.currentReason}`);
    });
  } else {
    console.log('\n✓ 100% agreement with golden labeled ground truth! (0 mismatches)');
  }
}

runGoldenEvaluation();
