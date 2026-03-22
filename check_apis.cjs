const https = require("https");

function httpsGet(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("JSON parse error"));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

const cleanIp = "196.16.220.74";

async function run() {
  try {
    const d1 = await httpsGet(`https://api.iplocation.net/?ip=${cleanIp}`);
    console.log("api.iplocation.net:", d1.country_code2, d1.country_name);
  } catch(e) { console.log("d1 err", e.message); }
  
  try {
    const d2 = await httpsGet(`https://get.geojs.io/v1/ip/country/${cleanIp}.json`);
    console.log("geojs.io:", d2.country_code, d2.country);
  } catch(e) { console.log("d2 err", e.message); }
  
  try {
    const d3 = await httpsGet(`https://api.country.is/${cleanIp}`);
    console.log("country.is:", d3.country);
  } catch(e) { console.log("d3 err", e.message); }
}

run();
