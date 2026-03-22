const https = require("https");

function httpsGet(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse error: " + data)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(); reject(new Error("timeout"));
    });
  });
}

async function testIp(ip) {
  console.log(`\n--- Опрос IP: ${ip} ---`);
  try {
    const r1 = await httpsGet(`https://api.country.is/${ip}`);
    console.log(`[country.is]     ${ip} ->`, r1.country);
  } catch (e) { console.log(`[country.is]     Ошибка:`, e.message); }
  
  try {
    const r2 = await httpsGet(`https://get.geojs.io/v1/ip/country/${ip}.json`);
    console.log(`[geojs.io]       ${ip} ->`, r2.country);
  } catch (e) { console.log(`[geojs.io]       Ошибка:`, e.message); }
  
  try {
    const r3 = await httpsGet(`https://api.iplocation.net/?ip=${ip}`);
    console.log(`[iplocation.net] ${ip} ->`, r3.country_code2, `(${r3.country_name})`);
  } catch (e) { console.log(`[iplocation.net] Ошибка:`, e.message); }
}

(async () => {
  // Американский IP из скриншота (который показывал Нидерланды)
  await testIp("45.85.162.156");  
  // Немецкий IP из скриншота
  await testIp("196.16.220.74");   
})();
