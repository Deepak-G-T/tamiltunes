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
    return raw;
  } catch (e) {
    return null;
  }
}

async function testQuery(q) {
  console.log(`\n=================== SEARCHING: "${q}" ===================`);
  const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q=${encodeURIComponent(q)}&p=1&n=5`;
  const res = await fetch(url).then(r => r.json());
  
  if (!res.results || res.results.length === 0) {
    console.log('No results from JioSaavn.');
    return;
  }

  for (const song of res.results) {
    console.log(`\n🎵 Title: "${song.song}"`);
    console.log(`   Album: "${song.album}" | Language: "${song.language}"`);
    console.log(`   Singers: "${song.singers}" | Music: "${song.music}"`);
    const rawUrl = decrypt(song.encrypted_media_url);
    console.log(`   Decrypted CDN URL (raw):`, rawUrl);
    if (rawUrl) {
      const u320 = rawUrl.replace(/_96\.mp4$/, '_320.mp4');
      const u160 = rawUrl.replace(/_96\.mp4$/, '_160.mp4');
      
      const head320 = await fetch(u320, { method: 'HEAD' }).then(r => r.status).catch(e => e.message);
      const head160 = await fetch(u160, { method: 'HEAD' }).then(r => r.status).catch(e => e.message);
      const head96 = await fetch(rawUrl, { method: 'HEAD' }).then(r => r.status).catch(e => e.message);
      console.log(`   Quality Availability: 320kbps -> ${head320} | 160kbps -> ${head160} | 96kbps -> ${head96}`);
    }
  }
}

async function run() {
  await testQuery('Badass Leo');
  await testQuery('Hukum Jailer');
  await testQuery('Chinna Chinna Aasai');
}

run();
