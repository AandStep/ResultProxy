import https from 'https';
import net from 'net';

export function validateIp(ip: string): boolean {
    if (!ip || typeof ip !== 'string') return false;
    const cleanIp = ip.split(':')[0];
    return net.isIP(cleanIp) !== 0;
}

function httpsGet(url: string, timeoutMs: number = 3000): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
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

export async function detectCountryBackend(cleanIp: string): Promise<string | null> {
    // 1. iplocation.net
    try {
        const data = await httpsGet(`https://api.iplocation.net/?ip=${cleanIp}`);
        if (
            data &&
            data.country_code2 &&
            data.country_code2 !== '-' &&
            data.country_code2.length === 2
        ) {
            return data.country_code2.toLowerCase();
        }
    } catch (e) { }

    // 2. geojs.io
    try {
        const data = await httpsGet(
            `https://get.geojs.io/v1/ip/country/${cleanIp}.json`,
        );
        if (data && data.country_code && data.country_code.length === 2) {
            return data.country_code.toLowerCase();
        }
    } catch (e) { }

    // 3. country.is
    try {
        const data = await httpsGet(`https://api.country.is/${cleanIp}`);
        if (data && data.country && data.country.length === 2) {
            return data.country.toLowerCase();
        }
    } catch (e) { }

    return null;
}
