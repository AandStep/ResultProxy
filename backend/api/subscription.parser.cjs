const https = require('https');

class SubscriptionParser {
    /**
     * Parse a single VLESS URI
     * Format: vless://uuid@host:port?params#name
     */
    parseVlessUri(uri) {
        try {
            if (!uri.startsWith('vless://')) return null;

            // Extract uuid, host, port
            const parts = uri.substring(8).split('@');
            if (parts.length !== 2) return null;

            const userId = parts[0];
            const addressPart = parts[1].split('?');
            if (addressPart.length === 0) return null;

            const hostPort = addressPart[0].split(':');
            const address = hostPort[0];
            const port = hostPort[1] || '443';

            let queryParams = '';
            let nameObj = '';

            if (addressPart.length > 1) {
                const queryAndName = addressPart[1].split('#');
                queryParams = queryAndName[0];
                if (queryAndName.length > 1) {
                    nameObj = decodeURIComponent(queryAndName[1]);
                }
            }

            const params = new URLSearchParams(queryParams);

            const node = {
                protocol: 'vless',
                id: Math.random().toString(36).substring(2, 9),
                name: nameObj || address,
                address,
                port: parseInt(port, 10),
                userId,
                encryption: params.get('encryption') || 'none',
                network: params.get('type') || 'tcp',
                security: params.get('security') || 'none',
                sni: params.get('sni') || '',
                fp: params.get('fp') || '',
                pbk: params.get('pbk') || '',
                sid: params.get('sid') || '',
                spx: params.get('spx') || '',
                path: params.get('path') || '/',
                host: params.get('host') || '',
                flow: params.get('flow') || ''
            };

            // Best effort country extraction via Flag Emojis or simple detection
            node.country = this.extractCountry(node.name);

            return node;
        } catch (e) {
            console.error('Failed to parse URI:', uri, e);
            return null;
        }
    }

    extractCountry(name) {
        // Look for regional indicators (flag emojis)
        const regex = /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/;
        const match = name.match(regex);
        if (match) return match[0];

        // Look for common keywords
        if (name.toLowerCase().includes('us') || name.toLowerCase().includes('united states')) return '🇺🇸';
        if (name.toLowerCase().includes('de') || name.toLowerCase().includes('germany') || name.toLowerCase().includes('frankfurt')) return '🇩🇪';
        if (name.toLowerCase().includes('nl') || name.toLowerCase().includes('netherlands')) return '🇳🇱';
        if (name.toLowerCase().includes('ru') || name.toLowerCase().includes('russia')) return '🇷🇺';
        if (name.toLowerCase().includes('uk') || name.toLowerCase().includes('london')) return '🇬🇧';
        return '🏳️';
    }

    /**
     * Fetch and decode a base64 subscription URL
     */
    async fetchSubscription(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const decoded = Buffer.from(data, 'base64').toString('utf-8');
                        const lines = decoded.split('\n').map(l => l.trim()).filter(l => l);
                        const nodes = lines.map(line => {
                            if (line.startsWith('vless://')) {
                                return this.parseVlessUri(line);
                            }
                            // Add other protocols (vmess, trojan) here if needed later
                            return null;
                        }).filter(n => n !== null);

                        resolve(nodes);
                    } catch (e) {
                        reject(new Error('Failed to decode subscription: ' + e.message));
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * Parse either a direct URI or fetch a subscription link
     */
    async processInput(input) {
        input = input.trim();
        if (input.startsWith('vless://')) {
            return [this.parseVlessUri(input)].filter(n => n);
        } else if (input.startsWith('http://') || input.startsWith('https://')) {
            return this.fetchSubscription(input);
        } else {
            // Maybe base64 text pasted directly?
            try {
                const decoded = Buffer.from(input, 'base64').toString('utf-8');
                const lines = decoded.split('\n').map(l => l.trim()).filter(l => l);
                return lines.map(l => this.parseVlessUri(l)).filter(n => n);
            } catch (e) {
                throw new Error('Invalid input format');
            }
        }
    }
}

module.exports = new SubscriptionParser();
