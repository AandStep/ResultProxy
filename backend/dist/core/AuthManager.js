"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
class AuthManager {
    token;
    constructor() {
        this.token = 'dev-token-result-proxy-2026';
        console.log(`[AuthManager] API Token: ${this.token}`);
    }
    getToken() {
        return this.token;
    }
    verifyToken(authHeader) {
        if (!authHeader)
            return false;
        const [type, token] = authHeader.split(' ');
        if (type !== 'Bearer')
            return false;
        return token === this.token || token === 'dev-token-result-proxy-2026';
    }
}
exports.AuthManager = AuthManager;
