const { execSync } = require('child_process');

console.log("Устанавливаем geoip-lite (содержит базу MaxMind GeoLite2)...");
try {
  require.resolve('geoip-lite');
} catch(e) {
  execSync('npm i geoip-lite --no-save', { stdio: 'inherit' });
}

const geoip = require('geoip-lite');

function testGeoip(ip) {
  const geo = geoip.lookup(ip);
  console.log(`[geoip-lite / MaxMind GeoLite2] ${ip} ->`, geo ? geo.country : "UNKNOWN");
}

console.log("\nРезультаты MaxMind:");
testGeoip("45.85.162.156");
testGeoip("196.16.220.74");
