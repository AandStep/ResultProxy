"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const os_1 = __importDefault(require("os"));
class ConfigManager {
    configPath;
    encryptionKey;
    constructor(userDataPath) {
        if (!fs_1.default.existsSync(userDataPath)) {
            fs_1.default.mkdirSync(userDataPath, { recursive: true });
        }
        this.configPath = path_1.default.join(userDataPath, 'proxy_config.json');
        this.encryptionKey = this.generateKey();
    }
    generateKey() {
        // Simple hardware-bound key generation for demo
        const machineId = os_1.default.hostname() + os_1.default.userInfo().username + (os_1.default.platform() === 'win32' ? process.env.COMPUTERNAME : '');
        return crypto_1.default.createHash('sha256').update(machineId + '_ProxySecret_v1').digest();
    }
    async load() {
        if (!fs_1.default.existsSync(this.configPath)) {
            return {
                proxies: [],
                routingRules: { mode: 'global', whitelist: [], appWhitelist: [] },
                settings: {}
            };
        }
        try {
            const raw = fs_1.default.readFileSync(this.configPath, 'utf8');
            let data = JSON.parse(raw);
            if (data._isSecure) {
                data = this.decrypt(data);
            }
            // Ensure routingRules and its arrays are initialized to prevent frontend errors
            if (!data.routingRules) {
                data.routingRules = { mode: 'global', whitelist: [], appWhitelist: [] };
            }
            else {
                if (!Array.isArray(data.routingRules.whitelist))
                    data.routingRules.whitelist = [];
                if (!Array.isArray(data.routingRules.appWhitelist))
                    data.routingRules.appWhitelist = [];
                if (!data.routingRules.mode)
                    data.routingRules.mode = 'global';
            }
            if (!data.proxies)
                data.proxies = [];
            if (!data.settings)
                data.settings = {};
            return data;
        }
        catch (e) {
            console.error('[ConfigManager] Load error:', e);
            return {
                proxies: [],
                routingRules: { mode: 'global', whitelist: [], appWhitelist: [] },
                settings: {}
            };
        }
    }
    async save(config) {
        try {
            const encrypted = this.encrypt(config);
            fs_1.default.writeFileSync(this.configPath, JSON.stringify(encrypted, null, 2));
        }
        catch (e) {
            console.error('[ConfigManager] Save error:', e);
        }
    }
    encrypt(data) {
        const iv = crypto_1.default.randomBytes(12);
        const cipher = crypto_1.default.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return {
            _isSecure: true,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            data: encrypted.toString('hex'),
        };
    }
    decrypt(encrypted) {
        const iv = Buffer.from(encrypted.iv, 'hex');
        const authTag = Buffer.from(encrypted.authTag, 'hex');
        const data = Buffer.from(encrypted.data, 'hex');
        const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    }
}
exports.ConfigManager = ConfigManager;
