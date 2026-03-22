const https = require('https');
const fs = require('fs');

function get(url) {
  return new Promise(r => https.get(url, { headers: { 'User-Agent': 'curl/7.81.0' } }, res => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => r(JSON.parse(d)));
  }));
}

(async () => {
  try {
    const r1 = await get('https://ipapi.co/45.85.162.156/json/');
    const r2 = await get('https://ipapi.co/196.16.220.74/json/');
    fs.writeFileSync('maxmind-results.json', JSON.stringify({ ip_45_85_162_156: r1, ip_196_16_220_74: r2 }, null, 2));
  } catch(e) {
    fs.writeFileSync('maxmind-results.json', e.message);
  }
})();
