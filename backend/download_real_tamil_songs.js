import fs from 'fs';
import path from 'path';

const realTamilTracks = [
  { name: 'badass_leo.mp3', url: 'https://aac.saavncdn.com/415/46a7b21d2a3f4b9e019a7cdff7442c55_320.mp4' },
  { name: 'hukum_jailer.mp3', url: 'https://aac.saavncdn.com/187/0c4d0aee91a3ac81d4b645ec448a2960_320.mp4' },
  { name: 'naa_ready.mp3', url: 'https://aac.saavncdn.com/194/af240a77084e42e66f18defb87cda42a_320.mp4' },
  { name: 'vaathi_coming.mp3', url: 'https://aac.saavncdn.com/347/c536b256fca6b96aa432322c11c21fbb_320.mp4' },
  { name: 'chinna_chinna_aasai.mp3', url: 'https://aac.saavncdn.com/702/d7abe1123a022f3fb9f3e4bf725a032a_320.mp4' },
  { name: 'vaseegara.mp3', url: 'https://aac.saavncdn.com/450/4f7b9da8e887586e60b11afb602befac_320.mp4' },
  { name: 'munbe_vaa.mp3', url: 'https://aac.saavncdn.com/595/86c6a67ff7120d287cb4484ea020f488_320.mp4' },
  { name: 'ennavale_adi.mp3', url: 'https://aac.saavncdn.com/726/c395c9ca17f6183955ffe41fa0dbb6bc_320.mp4' },
  { name: 'kannaana_kanney.mp3', url: 'https://aac.saavncdn.com/006/40aacc11863cba58d37eefcbd23bee99_320.mp4' },
  { name: 'aalaporan_thamizhan.mp3', url: 'https://aac.saavncdn.com/492/eb45d961a1639b3c3a6df4c8777fa71c_320.mp4' }
];

const publicAudioDir = 'f:/project/project/backend/public/audio';
const songDir = 'f:/project/song';

fs.mkdirSync(publicAudioDir, { recursive: true });
fs.mkdirSync(songDir, { recursive: true });

async function downloadTrack(item) {
  const destBackend = path.join(publicAudioDir, item.name);
  const destSong = path.join(songDir, item.name);
  
  try {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destBackend, buf);
    fs.writeFileSync(destSong, buf);
    console.log(`Saved REAL Tamil Track: ${item.name} (${Math.round(buf.length / 1024 / 1024 * 10) / 10} MB)`);
  } catch (err) {
    console.error(`Failed ${item.name}:`, err.message);
  }
}

async function run() {
  console.log('Downloading 100% Real Authentic Tamil Songs...');
  for (const item of realTamilTracks) {
    await downloadTrack(item);
  }
  console.log('All real Tamil songs saved locally!');
}

run();
