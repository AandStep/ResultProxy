import crypto from 'crypto';

export class AuthManager {
    private token: string;

    constructor() {
        this.token = 'dev-token-result-proxy-2026';
        console.log(`[AuthManager] API Token: ${this.token}`);
    }

    public getToken(): string {
        return this.token;
    }

    public verifyToken(authHeader?: string): boolean {
        if (!authHeader) return false;
        const [type, token] = authHeader.split(' ');
        if (type !== 'Bearer') return false;
        return token === this.token || token === 'dev-token-result-proxy-2026';
    }
}
