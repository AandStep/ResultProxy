"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateIp = validateIp;
exports.detectCountryBackend = detectCountryBackend;
const https_1 = __importDefault(require("https"));
const net_1 = __importDefault(require("net"));
function validateIp(ip) {
    if (!ip || typeof ip !== 'string')
        return false;
    const cleanIp = ip.split(':')[0];
    return net_1.default.isIP(cleanIp) !== 0;
}
function httpsGet(url, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const req = https_1.default.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (e) {
                    reject(new Error('JSON parse error'));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error('timeout'));
        });
    });
}
async function detectCountryBackend(cleanIp) {
    // 1. iplocation.net
    try {
        const data = await httpsGet(`https://api.iplocation.net/?ip=${cleanIp}`);
        if (data &&
            data.country_code2 &&
            data.country_code2 !== '-' &&
            data.country_code2.length === 2) {
            return data.country_code2.toLowerCase();
        }
    }
    catch (e) { }
    // 2. geojs.io
    try {
        const data = await httpsGet(`https://get.geojs.io/v1/ip/country/${cleanIp}.json`);
        if (data && data.country_code && data.country_code.length === 2) {
            return data.country_code.toLowerCase();
        }
    }
    catch (e) { }
    // 3. country.is
    try {
        const data = await httpsGet(`https://api.country.is/${cleanIp}`);
        if (data && data.country && data.country.length === 2) {
            return data.country.toLowerCase();
        }
    }
    catch (e) { }
    return null;
}
