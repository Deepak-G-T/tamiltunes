import CryptoJS from 'crypto-js';

const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');

function decrypt(encrypted) {
  if (!encrypted) return null;
  try {
    const dec = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encrypted.trim()) },
      DES_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    const raw = dec.toString(CryptoJS.enc.Utf8).trim();
    if (!raw.startsWith('http')) return null;
    return raw.replace(/_96\.mp4$/, '_320.mp4');
  } catch (e) {
    return null;
  }
}

async function findTamilTrack(query) {
  const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q=${encodeURIComponent(query + ' tamil')}&p=1&n=10`;
  const res = await fetch(url).then(r => r.json());
  if (!res.results) return null;
  
  // Find track with language === 'tamil'
  let found = res.results.find(s => s.language?.toLowerCase() === 'tamil' && s.encrypted_media_url);
  if (!found) {
    found = res.results.find(s => s.encrypted_media_url);
  }
  if (!found) return null;

  const streamUrl = decrypt(found.encrypted_media_url);
  return {
    title: found.song,
    album: found.album,
    language: found.language,
    singers: found.singers || found.music,
    image: found.image?.replace(/150x150/, '500x500'),
    duration: parseInt(found.duration || 210, 10),
    streamUrl
  };
}

const list = [
  'Badass Leo Anirudh',
  'Hukum Thalaivar Alappara Jailer',
  'Naa Ready Thalapathy Vijay Leo',
  'Vaathi Coming Master Anirudh',
  'Chinna Chinna Asai Roja',
  'Vaseegara Minnale Bombay Jayashri',
  'Munbe Vaa Sillunu Oru Kaadhal',
  'Ennavale Adi Ennavale Kadhalan',
  'Kannaana Kanney Viswasam Sid Sriram',
  'Aalaporan Thamizhan Mersal AR Rahman',
  'Thendral Vanthu Theendum Pothu Avatharam Ilaiyaraaja',
  'New York Nagaram Sillunu Oru Kaadhal'
];

async function run() {
  const results = {};
  for (const q of list) {
    const track = await findTamilTrack(q);
    if (track) {
      console.log(`FOUND [${q}]: "${track.title}" in (${track.language}) -> ${track.streamUrl}`);
      results[q] = track;
    } else {
      console.log(`NOT FOUND: [${q}]`);
    }
  }
}
run();
