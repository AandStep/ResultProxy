import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

export class ConfigManager {
    private configPath: string;
    private encryptionKey: Buffer;

    constructor(userDataPath: string) {
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }
        this.configPath = path.join(userDataPath, 'proxy_config.json');
        this.encryptionKey = this.generateKey();
    }

    private generateKey(): Buffer {
        // Simple hardware-bound key generation for demo
        const machineId = os.hostname() + os.userInfo().username + (os.platform() === 'win32' ? process.env.COMPUTERNAME : '');
        return crypto.createHash('sha256').update(machineId + '_ProxySecret_v1').digest();
    }

    public async load(): Promise<any> {
        if (!fs.existsSync(this.configPath)) {
            return {
                proxies: [],
                routingRules: { mode: 'global', whitelist: [], appWhitelist: [] },
                settings: {}
            };
        }

        try {
            const raw = fs.readFileSync(this.configPath, 'utf8');
            let data = JSON.parse(raw);

            if (data._isSecure) {
                data = this.decrypt(data);
            }

            // Ensure routingRules and its arrays are initialized to prevent frontend errors
            if (!data.routingRules) {
                data.routingRules = { mode: 'global', whitelist: [], appWhitelist: [] };
            } else {
                if (!Array.isArray(data.routingRules.whitelist)) data.routingRules.whitelist = [];
                if (!Array.isArray(data.routingRules.appWhitelist)) data.routingRules.appWhitelist = [];
                if (!data.routingRules.mode) data.routingRules.mode = 'global';
            }
            if (!data.proxies) data.proxies = [];
            if (!data.settings) data.settings = {};

            return data;
        } catch (e) {
            console.error('[ConfigManager] Load error:', e);
            return {
                proxies: [],
                routingRules: { mode: 'global', whitelist: [], appWhitelist: [] },
                settings: {}
            };
        }
    }

    public async save(config: any): Promise<void> {
        try {
            const encrypted = this.encrypt(config);
            fs.writeFileSync(this.configPath, JSON.stringify(encrypted, null, 2));
        } catch (e) {
            console.error('[ConfigManager] Save error:', e);
        }
    }

    private encrypt(data: any): any {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return {
            _isSecure: true,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            data: encrypted.toString('hex'),
        };
    }

    private decrypt(encrypted: any): any {
        const iv = Buffer.from(encrypted.iv, 'hex');
        const authTag = Buffer.from(encrypted.authTag, 'hex');
        const data = Buffer.from(encrypted.data, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    }
}
